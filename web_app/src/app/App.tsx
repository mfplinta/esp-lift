import { useState, useEffect, useRef, useCallback } from 'react';
import { Sun, Moon, Settings, Wifi, Dumbbell } from 'lucide-react';
import MachineVisualizer from '@/app/components/MachineVisualizer';
import StatsDisplay from '@/app/components/StatsDisplay';
import Controls from '@/app/components/Controls';
import ConfigModal from '@/app/components/ConfigModal';
import ExerciseSelector from '@/app/components/ExerciseSelector';
import NotificationStack, {
  NotificationConfig,
  NotificationHandle,
} from '@/app/components/NotificationStack';
import useWebSocket from 'react-use-websocket-lite';
import WallClock from './components/WallClock';
import { useStore } from './store';
import SetHistory from './components/SetHistory';
import { Exercise, HardwareConfig } from './models';
import { useShallow } from 'zustand/react/shallow';
import DebugPanel from './components/DebugPanel';
import UserSelection from './components/UserSelection';
import UserAvatarButton from './components/UserAvatarButton';

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

  const {
    config,
    isDarkMode,
    selectedExercise,
    sliderThreshold,
    setSliderPositionLeft,
    setSliderPositionRight,
    applyRepCompleted,
    setExercises,
    lastMessageTime,
    setLastMessageTime,
    toggleTheme,
    hydrateConfig,
    hydrateSetHistory,
    hydrateUsers,
  } = useStore(
    useShallow((s) => ({
      config: s.config,
      isDarkMode: s.config.theme === 'dark',
      selectedExercise: s.selectedExercise,
      sliderThreshold: s.sliderThreshold,
      setSliderPositionLeft: s.setSliderPositionLeft,
      setSliderPositionRight: s.setSliderPositionRight,
      applyRepCompleted: s.applyRepCompleted,
      setExercises: s.setExercises,
      lastMessageTime: s.lastMessageTime,
      setLastMessageTime: s.setLastMessageTime,
      toggleTheme: s.toggleTheme,
      hydrateConfig: s.hydrateConfig,
      hydrateSetHistory: s.hydrateSetHistory,
      hydrateUsers: s.hydrateUsers,
    }))
  );

  // --- Helpers ---
  const notify = (msg: string, opt?: Partial<NotificationConfig>) =>
    notificationRef.current?.addNotification({ message: msg, ...opt });
  const dismissNotification = (msg: string) =>
    notificationRef.current?.dismissByMessage(msg);

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

  // --- API exercises ---
  const fetchExercises = async () => {
    try {
      const response = await fetch('/api/exercises');
      if (!response.ok) {
        throw new Error(
          { status: response.status, error: response.statusText }.toString()
        );
      }

      const data = await response.json();
      setExercises(data.exercises);
    } catch (e) {
      notify('Failed to fetch exercises', { variant: 'error' });
    }
  };

  const fetchHardwareConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(
          { status: response.status, error: response.statusText }.toString()
        );
      }

      const data = await response.json();
      setHardwareSettings(data);
    } catch (e) {
      notify('Failed to fetch settings', { variant: 'error' });
    }
  };

  const onAddExercise = async (exercise: Exercise) => {
    const response = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exercise),
    });
    if (!response.ok) {
      notify('Failed to add exercise', { variant: 'error' });
      return;
    }
    fetchExercises();
  };

  const onDeleteExercise = async (name: string) => {
    const response = await fetch(
      `/api/exercises?name=${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      notify('Failed to delete exercise', { variant: 'error' });
      return;
    }
    fetchExercises();
  };

  const sendCalibrateCommand = async () => {
    const response = await fetch('/api/calibrate');
    if (!response.ok) {
      notify('Failed to send calibrate command', { variant: 'error' });
    }
  };

  const sendRestartCommand = async () => {
    const response = await fetch('/api/restart');
    if (!response.ok) {
      notify('Failed to send restart command', { variant: 'error' });
    } else {
      notify('Restarting...', { variant: 'info' });
    }
  };

  const changeHardwareSettings = async (config: HardwareConfig) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error('Failed to update Wi-Fi settings');
      }
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
      setLastMessageTime(Date.now());
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
      setLastMessageTime(Date.now());
      handshakeExpiredRef.current = false;
      dismissNotification(MSG_WEBSOCKET_DISCONNECTED);

      if (data.event === 'handshake') {
        return;
      }

      const eventType = data.event ?? 'position';
      if (eventType === 'rep') {
        bumpWakeLock();
        if (data.name === 'right' || data.name === 'left') {
          applyRepCompleted(data.name);
        }
        return;
      }

      if (eventType === 'position') {
        bumpWakeLock();
        const calibrated = Math.min(Math.max(0, data.calibrated ?? 0), 100);

        if (data.name === 'right') setSliderPositionRight(calibrated);
        else setSliderPositionLeft(calibrated);

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
      await fetchHardwareConfig();
      await fetchExercises();
      hydrateConfig();
      hydrateSetHistory();
      hydrateUsers();
    })();
  }, []);

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
  }, [readyState, lastMessageTime, setLastMessageTime]);

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

  return (
    <div
      className={`fixed inset-0 transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-white text-black'}`}
    >
      {/* --- Top Bar --- */}
      <header className="w-full px-6 py-3 relative z-50">
        <div className="w-full mx-auto relative">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 flex gap-3">
            <button
              onClick={toggleTheme}
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
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4 pointer-events-none mt-20">
        {/* Stats Display (Center) */}
        <div className="pointer-events-auto mb-4">
          <StatsDisplay size="large" />
        </div>

        {/* Machine Visualizer */}
        <div className="flex-1 w-full max-w-md pointer-events-auto min-h-0">
          <MachineVisualizer />
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
      <NotificationStack ref={notificationRef} theme={config.theme} />

      {/* --- Debug Overlay --- */}
      {config.debugMode && <DebugPanel />}
    </div>
  );
}
