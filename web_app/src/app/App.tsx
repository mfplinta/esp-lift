import { useState, useEffect, useRef, useCallback } from 'react';
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
import useWebSocket from 'react-use-websocket-lite';
import WallClock from './components/WallClock';
import {
  applyRepCompleted,
  hydrateConfig,
  hydrateSetHistory,
  hydrateUsers,
  setExerciseData,
  setLastMessageTime,
  setSliderPositionLeft,
  setSliderPositionRight,
  reset,
  toggleTheme,
  updateExerciseThreshold,
  useAppDispatch,
  useAppSelector,
} from './store';
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
const HANDSHAKE_INTERVAL_MS = 15000;
const WAKELOCK_TIMEOUT_MS = 5 * 60 * 1000;

const host = window.location.href.split('/')[2];
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

export default function App() {
  const [showConfig, setShowConfig] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [wsEnabled, setWsEnabled] = useState(true);
  const [hardwareSettings, setHardwareSettings] = useState<HardwareConfig>({
    movement: {
      debounceInterval: 100,
      calibrationDebounceSteps: 25,
    },
  });

  // Refs
  const notificationRef = useRef<NotificationHandle>(null);
  const handshakeExpiredRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockTimerRef = useRef<number | null>(null);
  const lastMovementAtRef = useRef<number | null>(null);

  const dispatch = useAppDispatch();
  const {
    config,
    isDarkMode,
    exercises,
    selectedExercise,
    sliderThreshold,
    lastMessageTime,
    reps,
    sets,
    isResting,
  } = useAppSelector(
    (s) => ({
      config: s.machine.config,
      isDarkMode: s.machine.config.theme === 'dark',
      exercises: s.machine.exercises,
      selectedExercise: s.machine.selectedExercise,
      sliderThreshold: s.machine.sliderThreshold,
      lastMessageTime: s.machine.lastMessageTime,
      reps: s.machine.reps,
      sets: s.machine.sets,
      isResting: s.machine.isResting,
    }),
    shallowEqual
  );

  const { data: exercisesData, error: exercisesError } = useGetExercisesQuery();
  const { data: settingsData, error: settingsError } = useGetSettingsQuery();
  const [addExercise] = useAddExerciseMutation();
  const [deleteExercise] = useDeleteExerciseMutation();
  const [calibrate] = useCalibrateMutation();
  const [restart] = useRestartMutation();
  const [updateSettings] = useUpdateSettingsMutation();
  const [upsertExercise] = useUpsertExerciseMutation();

  const [repCounterOpen, setRepCounterOpen] = useState(false);
  const [repTarget, setRepTarget] = useState({
    enabled: false,
    reps: 10,
    sets: 3,
    restEnabled: false,
    restMinutes: 0,
    restSeconds: 0,
  });
  const lastBellSetRef = useRef<number | null>(null);
  const lastFinalBellSetRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const audioUnlockedRef = useRef(false);
  const bellPoolsRef = useRef<Record<string, HTMLAudioElement[]>>({
    '/set_rest_bell.mp3': [],
    '/workout_bell.mp3': [],
  });

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

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockTimerRef.current) {
      window.clearTimeout(wakeLockTimerRef.current);
      wakeLockTimerRef.current = null;
    }

    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (e) {
        // no-op
      } finally {
        wakeLockRef.current = null;
      }
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    if (document.visibilityState !== 'visible') return;

    if (!wakeLockRef.current) {
      try {
        wakeLockRef.current = await (
          navigator as Navigator & {
            wakeLock?: {
              request: (type: 'screen') => Promise<WakeLockSentinel>;
            };
          }
        ).wakeLock?.request('screen');

        wakeLockRef.current?.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch (e) {
        console.warn('Failed to acquire wake lock', e);
      }
    }
  }, []);

  const bumpWakeLock = useCallback(async () => {
    lastMovementAtRef.current = Date.now();
    await requestWakeLock();

    if (wakeLockTimerRef.current) {
      window.clearTimeout(wakeLockTimerRef.current);
    }

    wakeLockTimerRef.current = window.setTimeout(() => {
      releaseWakeLock();
    }, WAKELOCK_TIMEOUT_MS);
  }, [releaseWakeLock, requestWakeLock]);

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

  // --- WebSocket ---
  const { readyState, sendMessage } = useWebSocket({
    url: `${wsProtocol}://${host}/ws`,
    connect: wsEnabled,
    shouldReconnect: true,
    retryOnError: true,
    reconnectInterval: (attempt) => Math.min(10000, 1000 * attempt),
    onOpen: () => {
      dispatch(setLastMessageTime(Date.now()));
      handshakeExpiredRef.current = false;
      notify(MSG_WEBSOCKET_CONNECTED, { variant: 'success', icon: Wifi });
    },
    onClose: () => {
      notify(MSG_WEBSOCKET_DISCONNECTED, {
        variant: 'error',
        icon: Wifi,
        autoDismiss: 0,
      });
    },
    onError: () => {
      notify(MSG_WEBSOCKET_ERROR, {
        variant: 'error',
        icon: Wifi,
        autoDismiss: 0,
      });
    },
    onMessage: (e) => {
      const data: {
        event?: 'position' | 'rep' | 'threshold' | 'handshake';
        name: string;
        calibrated: number;
        cal_state: 'idle' | 'seek_max' | 'done';
      } = JSON.parse(e.data);
      dispatch(setLastMessageTime(Date.now()));
      handshakeExpiredRef.current = false;
      dismissNotification(MSG_WEBSOCKET_DISCONNECTED);

      if (data.event === 'handshake') {
        return;
      }

      const eventType = data.event ?? 'position';
      if (eventType === 'rep') {
        bumpWakeLock();
        if (data.name === 'right' || data.name === 'left') {
          dispatch(applyRepCompleted(data.name));
        }
        return;
      }

      if (eventType === 'position') {
        bumpWakeLock();
        const calibrated = Math.min(Math.max(0, data.calibrated ?? 0), 100);

        if (data.name === 'right') dispatch(setSliderPositionRight(calibrated));
        else dispatch(setSliderPositionLeft(calibrated));

        if (data.cal_state == 'seek_max')
          notify(`Pull ${data.name} to calibrate, then let go`, {
            autoDismiss: 1000,
            icon: Dumbbell,
          });

        if (data.cal_state == 'idle') {
          notify(
            `${data.name.charAt(0).toUpperCase() + data.name.slice(1)} calibration reset`,
            { variant: 'info' }
          );
        }
      }
    },
  });

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
    let timer: number | undefined;

    if (readyState === WebSocket.CONNECTING) {
      notify(MSG_WEBSOCKET_CONNECTING, {
        variant: 'info',
        icon: Wifi,
        autoDismiss: 0,
      });
    } else if (readyState === WebSocket.OPEN) {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
      dismissNotification(MSG_WEBSOCKET_DISCONNECTED);
      dismissNotification(MSG_WEBSOCKET_ERROR);

      timer = window.setInterval(() => {
        const elapsed = Date.now() - lastMessageTime;
        if (elapsed <= HANDSHAKE_INTERVAL_MS) return;
        if (handshakeExpiredRef.current) return;

        handshakeExpiredRef.current = true;
        setWsEnabled(false);
        window.setTimeout(() => setWsEnabled(true), 500);
      }, 1000);
    } else if (readyState === WebSocket.CLOSED) {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
    }

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [readyState, lastMessageTime]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const lastMovement = lastMovementAtRef.current;
      if (document.visibilityState === 'visible' && lastMovement) {
        const elapsed = Date.now() - lastMovement;
        if (elapsed < WAKELOCK_TIMEOUT_MS) {
          requestWakeLock();
          return;
        }
      }

      releaseWakeLock();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock]);

  const sendThresholds = useCallback(
    (value: number) => {
      if (readyState !== WebSocket.OPEN) return;
      const clamped = Math.min(Math.max(0, value), 100);
      sendMessage(
        JSON.stringify({ event: 'threshold', name: 'left', threshold: clamped })
      );
      sendMessage(
        JSON.stringify({
          event: 'threshold',
          name: 'right',
          threshold: clamped,
        })
      );
    },
    [readyState, sendMessage]
  );

  useEffect(() => {
    if (!selectedExercise) return;
    sendThresholds(selectedExercise.thresholdPercentage);
  }, [selectedExercise, sendThresholds]);

  useEffect(() => {
    sendThresholds(sliderThreshold);
  }, [sliderThreshold, sendThresholds]);

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

  const playBell = useCallback((bellUrl: string, times = 1) => {
    const pool = bellPoolsRef.current[bellUrl] ?? [];

    for (let i = 0; i < times; i += 1) {
      window.setTimeout(() => {
        let audio = pool.find((item) => item.paused || item.ended);
        if (!audio) {
          audio = new Audio(bellUrl);
          audio.preload = 'auto';
          audio.volume = 0.8;
          pool.push(audio);
          bellPoolsRef.current[bellUrl] = pool;
        }

        audio.currentTime = 0;
        audio.play().catch(() => {
          // no-op
        });
      }, i * 450);
    }
  }, []);

  useEffect(() => {
    const preload = (bellUrl: string) => {
      const pool = bellPoolsRef.current[bellUrl] ?? [];
      if (pool.length === 0) {
        const audio = new Audio(bellUrl);
        audio.preload = 'auto';
        audio.volume = 0.8;
        pool.push(audio);
        bellPoolsRef.current[bellUrl] = pool;
      }
    };

    preload('/set_rest_bell.mp3');
    preload('/workout_bell.mp3');
  }, []);

  useEffect(() => {
    if (audioUnlockedRef.current) return;

    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      Object.values(bellPoolsRef.current).forEach((pool) => {
        pool.forEach((audio) => {
          audio.muted = true;
          audio
            .play()
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch(() => {
              audio.muted = false;
            });
        });
      });
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const isFinalTargetSet = repTarget.enabled
    ? sets === Math.max(0, repTarget.sets - 1)
    : false;
  const isNearTarget =
    repTarget.enabled && reps >= Math.max(0, repTarget.reps - 2) && !isResting;

  useEffect(() => {
    if (!repTarget.enabled || isResting) return;
    if (reps < repTarget.reps) return;

    if (isFinalTargetSet) {
      if (lastFinalBellSetRef.current !== sets) {
        lastFinalBellSetRef.current = sets;
        lastBellSetRef.current = sets;
        playBell('/workout_bell.mp3', 3);
      }
      return;
    }

    if (lastBellSetRef.current !== sets) {
      lastBellSetRef.current = sets;
      playBell('/set_rest_bell.mp3', 1);
    }
  }, [isFinalTargetSet, isResting, playBell, repTarget, reps, sets]);

  useEffect(() => {
    if (restTimerRef.current) {
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }

    if (!repTarget.restEnabled || !isResting) return;
    const durationSeconds = repTarget.restMinutes * 60 + repTarget.restSeconds;
    if (durationSeconds <= 0) return;

    restTimerRef.current = window.setTimeout(() => {
      playBell('/set_rest_bell.mp3', 1);
    }, durationSeconds * 1000);
  }, [isResting, playBell, repTarget]);

  useEffect(() => {
    let lastDay = new Date().toDateString();
    const timer = window.setInterval(() => {
      const nextDay = new Date().toDateString();
      if (nextDay !== lastDay) {
        lastDay = nextDay;
        dispatch(reset());
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, [dispatch]);

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
              <StatsDisplay
                size="large"
                repsTone={
                  isFinalTargetSet && reps >= repTarget.reps
                    ? 'reached'
                    : isNearTarget
                      ? 'near'
                      : 'normal'
                }
              />
              {repTarget.enabled && (
                <div
                  className={`text-xs tracking-wide uppercase text-center md:text-right ${
                    isDarkMode ? 'text-white/50' : 'text-black/50'
                  }`}
                >
                  Target: {repTarget.sets} sets × {repTarget.reps} reps
                </div>
              )}
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
        target={repTarget}
        onChange={setRepTarget}
      />
      <NotificationStack ref={notificationRef} theme={config.theme} />

      {/* --- Debug Overlay --- */}
      {config.debugMode && <DebugPanel />}
    </div>
  );
}
