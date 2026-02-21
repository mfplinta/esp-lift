export interface SetRecord {
  // setNumber removed — history items no longer show sequential numbers
  setNumber?: number;
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
  categoryId?: string;
  categoryName?: string;
}

export interface Category {
  id: string;
  name: string;
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
