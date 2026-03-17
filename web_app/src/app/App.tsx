import { useState, useEffect, useRef, useCallback } from 'react';
import { useWakeLock } from 'react-screen-wake-lock';
import { Sun, Moon, Settings, Wifi, Dumbbell, Bell } from 'lucide-react';
import MachineVisualizer from './components/MachineVisualizer';
import StatsDisplay from './components/StatsDisplay';
import Controls from './components/Controls';
import ConfigModal from './components/ConfigModal';
import ExerciseSelector from './components/ExerciseSelector';
import NotificationStack, {
  NotificationConfig,
  NotificationHandle,
} from './components/NotificationStack';
import WallClock from './components/WallClock';
import {
  hydrateConfig,
  hydrateSetHistory,
  hydrateUsers,
  setExerciseData,
  toggleTheme,
  updateExerciseThreshold,
  updateExerciseRepBand,
  useAppDispatch,
  useAppSelector,
  setWakelockTimeoutAt,
} from './store';
import { wsConnect, wsDisconnect, wsSendThresholds } from './wsMiddleware';
import SetHistory from './components/SetHistory';
import { Exercise, HardwareConfig } from './models';
import DebugPanel from './components/DebugPanel';
import UserSelection from './components/UserSelection';
import UserAvatarButton from './components/UserAvatarButton';
import { shallowEqual } from 'react-redux';
import RepCounterModal from './components/RepCounterModal';
import {
  useAddExerciseMutation,
  useCalibrateMutation,
  useDeleteExerciseMutation,
  useGetExercisesQuery,
  useGetSettingsQuery,
  useRestartMutation,
  useUpsertExerciseMutation,
  useUpdateSettingsMutation,
} from './services/espApi';

const MSG_WEBSOCKET_CONNECTING = 'Connecting...';
const MSG_WEBSOCKET_CONNECTED = 'Connected';
const MSG_WEBSOCKET_ERROR = 'Error connecting to device';
const MSG_WEBSOCKET_DISCONNECTED = 'Disconnected. Reconnecting...';
const WAKELOCK_TIMEOUT_MS = 5 * 60 * 1000;

export default function App() {
  const [showConfig, setShowConfig] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [hardwareSettings, setHardwareSettings] = useState<HardwareConfig>({
    movement: {
      debounceInterval: 100,
      calibrationDebounceSteps: 25,
    },
  });

  // Refs
  const notificationRef = useRef<NotificationHandle>(null);
  const wakeLockTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const dispatch = useAppDispatch();
  const {
    config,
    isDarkMode,
    exercises,
    selectedExercise,
    sliderThreshold,
    sliderRepBand,
    lastMovementTime,
  } = useAppSelector(
    (s) => ({
      config: s.machine.config,
      isDarkMode: s.machine.config.theme === 'dark',
      exercises: s.machine.exercises,
      selectedExercise: s.machine.selectedExercise,
      sliderThreshold: s.machine.sliderThreshold,
      sliderRepBand: s.machine.sliderRepBand,
      lastMovementTime: s.machine.lastMovementTime,
      reps: s.machine.reps,
      sets: s.machine.sets,
      isResting: s.machine.isResting,
      activeTime: s.machine.activeTime,
      repTarget: s.machine.repTarget,
      wakelockTimeoutAt: s.machine.wakelockTimeoutAt,
    }),
    shallowEqual
  );

  const wsReadyState = useAppSelector((s) => s.machine.wsReadyState);
  const wsErrored = useAppSelector((s) => s.machine.wsErrored);
  const calibrationEvent = useAppSelector((s) => s.machine.calibrationEvent);

  const { data: exercisesData, error: exercisesError } = useGetExercisesQuery();
  const { data: settingsData, error: settingsError } = useGetSettingsQuery();
  const [addExercise] = useAddExerciseMutation();
  const [deleteExercise] = useDeleteExerciseMutation();
  const [calibrate] = useCalibrateMutation();
  const [restart] = useRestartMutation();
  const [updateSettings] = useUpdateSettingsMutation();
  const [upsertExercise] = useUpsertExerciseMutation();

  const [repCounterOpen, setRepCounterOpen] = useState(false);

  // --- Helpers ---
  const notify = useCallback(
    (msg: string, opt?: Partial<NotificationConfig>) =>
      notificationRef.current?.addNotification({ message: msg, ...opt }),
    []
  );
  const dismissNotification = useCallback(
    (msg: string) => notificationRef.current?.dismissByMessage(msg),
    []
  );

  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock({
    reacquireOnPageVisible: true,
    onError: (e) => console.warn('Failed to acquire wake lock', e),
  });

  const bumpWakeLock = useCallback(async () => {
    await requestWakeLock();

    if (wakeLockTimerRef.current) {
      window.clearTimeout(wakeLockTimerRef.current);
    }

    const timeoutAt = Date.now() + WAKELOCK_TIMEOUT_MS;
    dispatch(setWakelockTimeoutAt(timeoutAt));

    wakeLockTimerRef.current = window.setTimeout(async () => {
      await releaseWakeLock();
      dispatch(setWakelockTimeoutAt(null));
    }, WAKELOCK_TIMEOUT_MS);
  }, [requestWakeLock, releaseWakeLock, dispatch]);

  const onAddExercise = async (exercise: Exercise) => {
    try {
      await addExercise(exercise).unwrap();
    } catch (e) {
      notify('Failed to add exercise', { variant: 'error' });
    }
  };

  const onDeleteExercise = async (name: string) => {
    try {
      await deleteExercise(name).unwrap();
    } catch (e) {
      notify('Failed to delete exercise', { variant: 'error' });
    }
  };

  const sendCalibrateCommand = async () => {
    try {
      await calibrate().unwrap();
    } catch (e) {
      console.error(e);
      notify('Failed to send calibrate command', { variant: 'error' });
    }
  };

  const sendRestartCommand = async () => {
    try {
      await restart().unwrap();
      notify('Restarting...', { variant: 'info' });
    } catch (e) {
      notify('Failed to send restart command', { variant: 'error' });
    }
  };

  const changeHardwareSettings = async (config: HardwareConfig) => {
    try {
      await updateSettings(config).unwrap();
      notify('Hardware settings updated. Device will restart.', {
        variant: 'info',
      });
      await sendRestartCommand();
    } catch (e) {
      notify('Failed to update Wi-Fi settings', { variant: 'error' });
    }
  };

  // --- WebSocket lifecycle ---
  useEffect(() => {
    dispatch(wsConnect());
    return () => {
      dispatch(wsDisconnect());
    };
  }, [dispatch]);

  // --- WS status notifications ---
  useEffect(() => {
    if (wsReadyState < 0) return; // not started

    if (wsReadyState === WebSocket.CONNECTING) {
      notify(MSG_WEBSOCKET_CONNECTING, {
        variant: 'info',
        icon: Wifi,
        autoDismiss: 0,
      });
    } else if (wsReadyState === WebSocket.OPEN) {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
      dismissNotification(MSG_WEBSOCKET_DISCONNECTED);
      dismissNotification(MSG_WEBSOCKET_ERROR);
      notify(MSG_WEBSOCKET_CONNECTED, { variant: 'success', icon: Wifi });
    } else if (wsReadyState === WebSocket.CLOSED) {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
      if (wsErrored) {
        notify(MSG_WEBSOCKET_ERROR, {
          variant: 'error',
          icon: Wifi,
          autoDismiss: 0,
        });
      }
      notify(MSG_WEBSOCKET_DISCONNECTED, {
        variant: 'error',
        icon: Wifi,
        autoDismiss: 0,
      });
    }
  }, [wsReadyState, wsErrored, notify, dismissNotification]);

  // --- Calibration notifications ---
  useEffect(() => {
    if (!calibrationEvent) return;
    if (calibrationEvent.state === 'seek_max') {
      notify(`Pull ${calibrationEvent.name} to calibrate, then let go`, {
        autoDismiss: 1000,
        icon: Dumbbell,
      });
    } else if (calibrationEvent.state === 'idle') {
      notify(
        `${calibrationEvent.name.charAt(0).toUpperCase() + calibrationEvent.name.slice(1)} calibration reset`,
        { variant: 'info' }
      );
    }
  }, [calibrationEvent, notify]);

  // --- Bump wakelock on position events ---
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    bumpWakeLock();
  }, [lastMovementTime, bumpWakeLock]);

  // --- Send thresholds on change or reconnect ---
  useEffect(() => {
    if (wsReadyState !== WebSocket.OPEN) return;
    dispatch(
      wsSendThresholds({ threshold: sliderThreshold, repBand: sliderRepBand })
    );
  }, [
    wsReadyState,
    sliderThreshold,
    sliderRepBand,
    selectedExercise,
    dispatch,
  ]);

  useEffect(() => {
    (async () => {
      dispatch(hydrateConfig());
      dispatch(hydrateSetHistory());
      dispatch(hydrateUsers());
    })();
  }, [dispatch]);

  useEffect(() => {
    if (exercisesData) {
      dispatch(setExerciseData(exercisesData));
    }
  }, [dispatch, exercisesData]);

  useEffect(() => {
    if (settingsData) {
      setHardwareSettings(settingsData);
    }
  }, [settingsData]);

  useEffect(() => {
    if (exercisesError) {
      notify('Failed to fetch exercises', { variant: 'error' });
    }
  }, [exercisesError]);

  useEffect(() => {
    if (settingsError) {
      notify('Failed to fetch settings', { variant: 'error' });
    }
  }, [settingsError]);

  useEffect(() => {
    if (!selectedExercise) return;
    if (sliderRepBand === (selectedExercise.repBand ?? 10)) return;

    const matchingExercise = exercises.find(
      (exercise) => exercise.name === selectedExercise.name
    );
    const resolvedCategoryId =
      selectedExercise.categoryId ?? matchingExercise?.categoryId;

    dispatch(
      updateExerciseRepBand({
        name: selectedExercise.name,
        repBand: sliderRepBand,
      })
    );

    upsertExercise({
      ...selectedExercise,
      repBand: sliderRepBand,
      ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
    })
      .unwrap()
      .catch(() => {
        notify('Failed to save rep band', { variant: 'error' });
      });
  }, [
    dispatch,
    notify,
    selectedExercise,
    sliderRepBand,
    upsertExercise,
    exercises,
  ]);

  useEffect(() => {
    if (!selectedExercise) return;
    if (sliderThreshold === selectedExercise.thresholdPercentage) return;

    const matchingExercise = exercises.find(
      (exercise) => exercise.name === selectedExercise.name
    );
    const resolvedCategoryId =
      selectedExercise.categoryId ?? matchingExercise?.categoryId;

    dispatch(
      updateExerciseThreshold({
        name: selectedExercise.name,
        thresholdPercentage: sliderThreshold,
      })
    );

    upsertExercise({
      ...selectedExercise,
      thresholdPercentage: sliderThreshold,
      ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
    })
      .unwrap()
      .catch(() => {
        notify('Failed to save threshold', { variant: 'error' });
      });
  }, [
    dispatch,
    notify,
    selectedExercise,
    sliderThreshold,
    upsertExercise,
    exercises,
  ]);

  return (
    <div
      className={`fixed inset-0 transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-white text-black'}`}
    >
      {/* --- Top Bar --- */}
      <header className="w-full px-6 py-3 relative z-50">
        <div className="w-full mx-auto relative">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 flex gap-3">
            <button
              onClick={() => dispatch(toggleTheme())}
              className={`p-3 rounded-full shadow-lg transition-transform hover:scale-105 ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}
            >
              {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className={`p-3 rounded-full shadow-lg transition-transform hover:scale-105 ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}
            >
              <Settings size={24} />
            </button>
          </div>

          <div className="flex justify-end sm:justify-center">
            <ExerciseSelector
              onAddExercise={onAddExercise}
              onDeleteExercise={onDeleteExercise}
            />
          </div>

          <div className="hidden sm:flex absolute right-0 top-1/2 transform -translate-y-1/2">
            <WallClock />
            <UserAvatarButton onClick={() => setShowSelector(true)} />
          </div>
        </div>
      </header>

      {/* --- Side Panel (History) --- */}
      <SetHistory />

      {/* --- Main Content --- */}
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4 pointer-events-none mt-20 md:pl-[320px]">
        <div className="flex-1 w-full flex items-center justify-center pointer-events-none min-h-0">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12 pointer-events-auto">
            {/* Stats Display */}
            <div className="flex flex-col items-center md:items-end gap-3 order-1 md:order-2">
              <StatsDisplay size="large" />
              <button
                onClick={() => setRepCounterOpen(true)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm shadow-lg transition-transform hover:scale-105 ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}
              >
                <Bell size={16} />
                Counter
              </button>
            </div>

            {/* Machine Visualizer */}
            <div className="w-full max-w-md min-h-[380px] h-[70vh] max-h-[740px] order-2 md:order-1">
              <MachineVisualizer />
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-6 right-6 pointer-events-auto z-23">
          <Controls />
        </div>
      </div>

      {/* --- Modals & Notifications --- */}
      <ConfigModal
        isOpen={showConfig}
        hardwareSettings={hardwareSettings}
        onClose={() => setShowConfig(false)}
        onCalibrate={sendCalibrateCommand}
        onRestart={sendRestartCommand}
        onHardwareChange={changeHardwareSettings}
      />
      <UserSelection
        isOpen={showSelector}
        onClose={() => setShowSelector(false)}
      />
      <RepCounterModal
        isOpen={repCounterOpen}
        onClose={() => setRepCounterOpen(false)}
      />
      <NotificationStack ref={notificationRef} theme={config.theme} />

      {/* --- Debug Overlay --- */}
      {config.debugMode && <DebugPanel />}
    </div>
  );
}
