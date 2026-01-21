import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Settings, Clock, Wifi, Dumbbell } from 'lucide-react';
import MachineVisualizer from '@/app/components/MachineVisualizer';
import StatsDisplay from '@/app/components/StatsDisplay';
import Controls from '@/app/components/Controls';
import ConfigModal, { Config } from '@/app/components/ConfigModal';
import ExerciseSelector, { Exercise } from '@/app/components/ExerciseSelector';
import NotificationStack, {
  NotificationConfig,
  NotificationHandle,
} from '@/app/components/NotificationStack';
import SetHistory, { SetHistoryHandle } from './components/SetHistory';
import useWebSocket from 'react-use-websocket-lite';
import WallClock from './components/WallClock';

const MSG_WEBSOCKET_CONNECTING = 'Connecting...';
const MSG_WEBSOCKET_CONNECTED = 'Connected';
const MSG_WEBSOCKET_ERROR = 'Error connecting to device';

export default function App() {
  const [showConfig, setShowConfig] = useState(false);

  // Refs
  const notificationRef = useRef<NotificationHandle>(null);
  const historyRef = useRef<SetHistoryHandle>(null);

  // --- THEME  ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  });

  // --- STATE: Machine Data ---
  const [handlePosition, setHandlePosition] = useState(0);
  const [handlePositionRight, setHandlePositionRight] = useState(0);
  const [reps, setReps] = useState(0);
  const [repsLeft, setRepsLeft] = useState(0);
  const [repsRight, setRepsRight] = useState(0);

  // --- STATE: Logic & Timing ---
  const [sets, setSets] = useState(0);
  const [activeTime, setActiveTime] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);

  // Rep detection state
  const [thresholdPosition, setThresholdPosition] = useState(70);
  const [lastCrossed, setLastCrossed] = useState(false);
  const [lastCrossedRight, setLastCrossedRight] = useState(false);
  const [lastMovementTime, setLastMovementTime] = useState(Date.now());

  // --- STATE: Configuration ---
  const [config, setConfig] = useState<Config>({
    strictMode: false,
    autoCompleteSecs: 0,
  });
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );

  // --- Helpers ---
  const notify = (msg: string, opt?: Partial<NotificationConfig>) =>
    notificationRef.current?.addNotification({ message: msg, ...opt });
  const dismissNotification = (msg: string) =>
    notificationRef.current?.dismissByMessage(msg);

  // --- API exercises ---
  const fetchExercises = async () => {
    try {
      const response = await fetch('/exercises');
      if (!response.ok) {
        throw new Error(
          { status: response.status, error: response.statusText }.toString()
        );
      }

      const data = await response.json();
      setExercises(data.exercises);
      if (data.length > 0) setSelectedExercise(data[0]);
    } catch (e) {
      notify('Failed to fetch exercises', { variant: 'error' });
    }
  };

  const addExercise = async (exercise: Exercise) => {
    const response = await fetch('/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exercise),
    });
    if (!response.ok) {
      notify('Failed to add exercise', { variant: 'error' });
      return;
    }
  };

  const deleteExercise = async (name: string) => {
    const response = await fetch(
      `/exercises?name=${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      notify('Failed to delete exercise', { variant: 'error' });
      return;
    }
  };

  const loadConfig = () => {
    try {
      const savedConfig = localStorage.getItem('app_settings');
      if (savedConfig) {
        const data = JSON.parse(savedConfig);
        setConfig(data);
        setAutoCompleteEnabled(data.autoCompleteSecs > 0);
      }
    } catch (e) {
      notify('Failed to load settings from storage', { variant: 'error' });
    }
  };

  const saveConfig = (newConfig: Partial<Config>) => {
    try {
      const fullConfig = { ...config, ...newConfig };
      localStorage.setItem('app_settings', JSON.stringify(fullConfig));
    } catch (e) {
      notify('Failed to save settings to storage', { variant: 'error' });
    }
  };

  const sendCalibrateCommand = async () => {
    const response = await fetch('/calibrate');
    if (!response.ok) {
      notify('Failed to send calibrate command', { variant: 'error' });
    }
  };

  const sendRestartCommand = async () => {
    const response = await fetch('/restart');
    if (!response.ok) {
      notify('Failed to send restart command', { variant: 'error' });
    } else {
      notify('Restarting...', { variant: 'info' });
    }
  };

  const changeWifiSettings = async (ssid: string, password: string) => {
    try {
      const response = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wifi: {
            ssid: ssid,
            password: password,
          },
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update Wi-Fi settings');
      }
      notify('Wi-Fi settings updated. Device will restart.', {
        variant: 'info',
      });
      await sendRestartCommand();
    } catch (e) {
      notify('Failed to update Wi-Fi settings', { variant: 'error' });
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    (async () => {
      await fetchExercises();
      loadConfig();
    })();
  }, []);

  // --- WebSocket ---
  const { readyState } = useWebSocket({
    url: `ws://${window.location.href.split('/')[2]}/ws`,
    onMessage: (e) => {
      const data: {
        name: string;
        calibrated: number;
        cal_state: 'idle' | 'seek_max' | 'done';
      } = JSON.parse(e.data);
      const calibrated = Math.min(Math.max(0, data.calibrated ?? 0), 100);

      if (selectedExercise?.type === 'alternating') {
        if (data.name === 'right') {
          setHandlePositionRight(calibrated);
        } else {
          setHandlePosition(calibrated);
        }
      } else {
        setHandlePosition(calibrated);
      }

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

  // --- Effects: Timers ---
  useEffect(() => {
    // Active Timer (Set OR Rest)
    let activityInterval: any;
    if (isTimerActive || isResting) {
      activityInterval = setInterval(() => setActiveTime((t) => t + 0.1), 100);
    }

    // Auto Set Completion
    let autoCheckInterval: any;
    if (autoCompleteEnabled && reps > 0 && !isResting) {
      autoCheckInterval = setInterval(() => {
        if ((Date.now() - lastMovementTime) / 1000 >= config.autoCompleteSecs)
          handleCompleteSet(true);
      }, 1000);
    }

    return () => {
      clearInterval(activityInterval);
      clearInterval(autoCheckInterval);
    };
  }, [isTimerActive, isResting, autoCompleteEnabled, reps, lastMovementTime]);

  // --- Logic: Rep Counting ---
  const processRep = (
    pos: number,
    lastState: boolean,
    setLastState: (v: boolean) => void,
    isRight: boolean
  ) => {
    const isAlternating = selectedExercise?.type === 'alternating';
    const inc = isAlternating ? 0.5 : 1;

    const triggerStart = config.strictMode ? pos > thresholdPosition : pos < 30;
    const triggerEnd = config.strictMode ? pos <= thresholdPosition : pos > 70;

    if (!lastState && triggerStart) {
      setLastState(true);
    } else if (lastState && triggerEnd) {
      // Rep Completed
      setReps((prev) => prev + inc);
      if (isAlternating)
        isRight ? setRepsRight((r) => r + 1) : setRepsLeft((l) => l + 1);
      setLastState(false);
      setLastMovementTime(Date.now());

      if (isResting) {
        historyRef.current?.addRecord({
          setNumber: 0,
          reps: 0,
          duration: activeTime,
          timestamp: Date.now(),
          exerciseName: 'Rest',
        });
        setIsResting(false);
        setActiveTime(0);
      }

      // Start set timer if not running
      if (!isTimerActive) setIsTimerActive(true);
    }
  };

  useEffect(
    () => processRep(handlePosition, lastCrossed, setLastCrossed, false),
    [handlePosition]
  );
  useEffect(() => {
    if (selectedExercise?.type === 'alternating')
      processRep(
        handlePositionRight,
        lastCrossedRight,
        setLastCrossedRight,
        true
      );
  }, [handlePositionRight]);

  // --- Handlers ---
  const handleCompleteSet = (autoSetTimedOut: boolean) => {
    if (reps > 0) {
      // Add SET to history
      historyRef.current?.addRecord({
        setNumber: sets + 1,
        reps,
        duration: activeTime,
        timestamp: Date.now(),
        exerciseName: selectedExercise?.name || 'Unknown',
      });

      // Reset Set Data
      setSets((s) => s + 1);
      setReps(0);
      setRepsLeft(0);
      setRepsRight(0);
      setLastCrossed(false);
      setLastCrossedRight(false);

      // Switch to REST mode
      setIsTimerActive(false);
      setIsResting(true);
      setActiveTime(autoSetTimedOut ? config.autoCompleteSecs : 0); // Reset timer for the Rest
    }
  };

  const handleReset = () => {
    setReps(0);
    setRepsLeft(0);
    setRepsRight(0);
    setSets(0);
    setActiveTime(0);
    setIsTimerActive(false);
    setIsResting(false);
    historyRef.current?.clearHistory();
  };

  return (
    <div
      className={`fixed inset-0 transition-colors duration-300 ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}
    >
      {/* --- Top Bar --- */}
      <header className="w-full px-6 py-3 relative z-50">
        <div className="w-full mx-auto relative">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 flex gap-3">
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-full shadow-lg transition-transform hover:scale-105 ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
            >
              {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className={`p-3 rounded-full shadow-lg transition-transform hover:scale-105 ${theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'}`}
            >
              <Settings size={24} />
            </button>
          </div>

          <div className="flex justify-end sm:justify-center">
            <ExerciseSelector
              exercises={exercises}
              selectedExercise={selectedExercise}
              onSelectExercise={setSelectedExercise}
              theme={theme}
              onAddExercise={async (n, t, type) => {
                const ex: Exercise = { name: n, thresholdPercentage: t, type };
                await addExercise(ex);
                await fetchExercises();
              }}
              onDeleteExercise={async (id) => {
                await deleteExercise(id);
                await fetchExercises();
              }}
            />
          </div>

          {/* Right: wall clock, only shown on sm+ */}
          <div className="hidden sm:flex absolute right-0 top-1/2 transform -translate-y-1/2">
            <WallClock />
          </div>
        </div>
      </header>

      {/* --- Side Panel (History) --- */}
      <SetHistory
        ref={historyRef}
        theme={theme}
        isResting={isResting}
        currentRestTime={isResting ? activeTime : 0}
        currentSetTime={!isResting ? activeTime : 0}
        setCount={sets}
      />

      {/* --- Main Content --- */}
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4 pointer-events-none mt-20">
        {/* Stats Display (Center) */}
        <div className="pointer-events-auto mb-4">
          <StatsDisplay
            label={isResting ? 'Resting' : 'Reps'}
            value={isResting ? activeTime : reps}
            theme={theme}
            size="large"
            isResting={isResting}
            // If StatsDisplay expects restTime separately:
            restTime={isResting ? activeTime : 0}
          />
        </div>

        {/* Machine Visualizer */}
        <div className="flex-1 w-full max-w-md pointer-events-auto min-h-0">
          <MachineVisualizer
            handlePosition={handlePosition}
            handlePositionRight={
              selectedExercise?.type === 'alternating'
                ? handlePositionRight
                : undefined
            }
            thresholdPosition={thresholdPosition}
            onPositionChange={setHandlePosition}
            onPositionRightChange={setHandlePositionRight}
            onThresholdChange={setThresholdPosition}
            theme={theme}
            isAlternating={selectedExercise?.type === 'alternating'}
            repsLeft={repsLeft}
            repsRight={repsRight}
            totalReps={reps}
          />
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-6 right-6 pointer-events-auto z-23">
          <Controls
            onCompleteSet={() => handleCompleteSet(false)}
            onReset={handleReset}
            theme={theme}
            hasReps={reps > 0}
          />
        </div>
      </div>

      {/* --- Modals & Notifications --- */}
      <ConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        theme={theme}
        config={config}
        onConfigChange={(newConfig, autoSetEnabled) => {
          setConfig(newConfig);
          setAutoCompleteEnabled(autoSetEnabled);
          saveConfig(newConfig);
        }}
        onCalibrate={sendCalibrateCommand}
        onRestart={sendRestartCommand}
        onWifiChange={changeWifiSettings}
      />
      <NotificationStack ref={notificationRef} theme={theme} />
    </div>
  );
}
