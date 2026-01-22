export interface SetRecord {
  setNumber: number;
  reps: number;
  duration: number;
  timestamp: number;
  exerciseName: string;
}

export interface Exercise {
  name: string;
  thresholdPercentage: number;
  type: 'singular' | 'alternating';
}

export interface Config {
  theme: 'light' | 'dark';
  strictMode: boolean;
  autoCompleteSecs: number;
}
