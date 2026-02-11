export interface SetRecord {
  setNumber: number;
  reps: number;
  duration: number;
  timestamp: number;
  exerciseName: string;
  userName?: string;
}

export interface User {
  name: string;
  color: string;
}

export interface Exercise {
  name: string;
  thresholdPercentage: number;
  type: 'singular' | 'alternating';
}

export interface AppConfig {
  theme: 'light' | 'dark';
  strictMode: boolean;
  autoCompleteSecs: number;
  debugMode: boolean;
}

export interface HardwareConfig {
  network?: {
    ssid?: string;
    password?: string;
    hostname?: string;
  };
  movement?: {
    debounceInterval?: number;
    calibrationDebounceSteps?: number;
  };
}
