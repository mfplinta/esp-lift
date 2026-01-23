import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Settings, Clock, Wifi, Dumbbell } from 'lucide-react';
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

const MSG_WEBSOCKET_CONNECTING = 'Connecting...';
const MSG_WEBSOCKET_CONNECTED = 'Connected';
const MSG_WEBSOCKET_ERROR = 'Error connecting to device';

const host = window.location.href.split('/')[2];

export default function App() {
  const [showConfig, setShowConfig] = useState(false);
  const [hardwareSettings, setHardwareSettings] = useState<HardwareConfig>({
    movement: {
      debounceInterval: 100,
    },
  });

  // Refs
  const notificationRef = useRef<NotificationHandle>(null);

  const {
    config,
    isDarkMode,
    setSliderPositionLeft,
    setSliderPositionRight,
    setExercises,
    toggleTheme,
    hydrateConfig,
    hydrateSetHistory,
  } = useStore(
    useShallow((s) => ({
      config: s.config,
      isDarkMode: s.config.theme === 'dark',
      setSliderPositionLeft: s.setSliderPositionLeft,
      setSliderPositionRight: s.setSliderPositionRight,
      setExercises: s.setExercises,
      toggleTheme: s.toggleTheme,
      hydrateConfig: s.hydrateConfig,
      hydrateSetHistory: s.hydrateSetHistory,
    }))
  );

  // --- Helpers ---
  const notify = (msg: string, opt?: Partial<NotificationConfig>) =>
    notificationRef.current?.addNotification({ message: msg, ...opt });
  const dismissNotification = (msg: string) =>
    notificationRef.current?.dismissByMessage(msg);

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
  const { readyState } = useWebSocket({
    url: `ws://${host}/ws`,
    onMessage: (e) => {
      const data: {
        name: string;
        calibrated: number;
        cal_state: 'idle' | 'seek_max' | 'done';
      } = JSON.parse(e.data);
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
    },
    onError: () => {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
      notify(MSG_WEBSOCKET_ERROR, {
        variant: 'error',
        icon: Wifi,
        autoDismiss: 10000,
      });
    },
  });

  useEffect(() => {
    (async () => {
      await fetchHardwareConfig();
      await fetchExercises();
      hydrateConfig();
      hydrateSetHistory();
    })();
  }, []);

  useEffect(() => {
    if (readyState === WebSocket.CONNECTING) {
      notify(MSG_WEBSOCKET_CONNECTING, {
        variant: 'info',
        icon: Wifi,
        autoDismiss: 0,
      });
    } else if (readyState === WebSocket.OPEN) {
      dismissNotification(MSG_WEBSOCKET_CONNECTING);
      notify(MSG_WEBSOCKET_CONNECTED, { variant: 'success', icon: Wifi });
    }
  }, [readyState]);

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

          {/* Right: wall clock, only shown on sm+ */}
          <div className="hidden sm:flex absolute right-0 top-1/2 transform -translate-y-1/2">
            <WallClock />
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
      <NotificationStack ref={notificationRef} theme={config.theme} />

      {/* --- Debug Overlay --- */}
      {config.debugMode && <DebugPanel />}
    </div>
  );
}
