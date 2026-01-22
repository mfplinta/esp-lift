import { create, StateCreator } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Exercise, SetRecord, Config } from './models';

type MachineStore = {
  /* Machine */
  selectedExercise?: Exercise;
  sliderPositionLeft: number;
  sliderPositionRight: number;
  lastSliderPosition: number;
  sliderThreshold: number;
  repsLeft: number;
  repsRight: number;
  sets: number;
  lastLeftState: boolean;
  lastRightState: boolean;
  isResting: boolean;
  activeTime: number;
  lastMovementTime: number;
  timerIntervalId: number | null;
  startTimer: () => void;
  stopTimer: () => void;
  tick: () => void;
  reps: number;
  isAlternating: boolean;

  /* Storage */
  exercises: Exercise[];
  history: SetRecord[];
  isHistoryHydrated: boolean;
  hydrateSetHistory: () => void;

  /* Config */
  config: Config;
  isConfigHydrated: boolean;
  hydrateConfig: () => void;
  setConfig: (config: Partial<Config>) => void;
  toggleTheme: () => void;

  setSelectedExercise: (ex: Exercise) => void;
  setSliderPositionLeft: (pos: number) => void;
  setSliderPositionRight: (pos: number) => void;
  setSliderThreshold: (v: number) => void;
  incrementLeft: () => void;
  incrementRight: () => void;
  processRep: (pos: number, isRight: boolean) => void;

  setExercises: (exs: Exercise[]) => void;
  addSetToHistory: (s: SetRecord) => void;
  addRestToHistory: () => void;
  clearHistory: () => void;

  completeSetOrRest: () => void;
  reset: () => void;
};

const storeCreator: StateCreator<
  MachineStore,
  [],
  [['zustand/subscribeWithSelector', never]]
> = (set, get) => ({
  /* Machine */
  selectedExercise: undefined,
  sliderPositionLeft: 0,
  sliderPositionRight: 0,
  lastSliderPosition: 0,
  sliderThreshold: 70,
  repsLeft: 0,
  repsRight: 0,
  sets: 0,
  lastLeftState: false,
  lastRightState: false,
  isResting: false,
  activeTime: 0,
  lastMovementTime: Date.now(),
  timerIntervalId: null,
  startTimer: () => {
    if (get().timerIntervalId) return;

    const id = window.setInterval(() => {
      get().tick();
    }, 100);

    set({ timerIntervalId: id });
  },
  stopTimer: () => {
    const id = get().timerIntervalId;
    if (id) {
      clearInterval(id);
      set({ timerIntervalId: null });
    }
  },
  tick: () => {
    const {
      activeTime,
      isResting,
      config,
      lastMovementTime,
      reps,
      completeSetOrRest: completeSet,
    } = get();

    set({ activeTime: activeTime + 0.1 });

    if (!isResting && reps > 0 && config.autoCompleteSecs > 0) {
      const secondsSinceMovement = (Date.now() - lastMovementTime) / 1000;
      if (secondsSinceMovement >= config.autoCompleteSecs) {
        completeSet();
      }
    }
  },
  reps: 0,
  isAlternating: false,

  /* Storage */
  exercises: [],
  history: [],
  isHistoryHydrated: false,
  hydrateSetHistory: () => {
    const saved = localStorage.getItem('workout_history_records');
    if (saved) {
      try {
        set({ isHistoryHydrated: true, history: JSON.parse(saved) });
        return;
      } catch {}
    }
    set({ isHistoryHydrated: true });
  },

  /* Config */
  config: {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
    strictMode: false,
    autoCompleteSecs: 0,
  },
  isConfigHydrated: false,
  hydrateConfig: () => {
    if (typeof window !== 'undefined') {
      const savedConfig = localStorage.getItem('app_settings');
      if (savedConfig) {
        try {
          set({ isConfigHydrated: true, config: JSON.parse(savedConfig) });
          return;
        } catch {}
      }
    }
    set({ isConfigHydrated: true });
  },
  setConfig: (config: Partial<Config>) => {
    const merged = { ...get().config, ...config };
    localStorage.setItem('app_settings', JSON.stringify(merged));
    set({ config: merged });
  },
  toggleTheme: () =>
    set((s) => ({
      config: {
        ...s.config,
        theme: s.config.theme === 'light' ? 'dark' : 'light',
      },
    })),

  setSelectedExercise: (ex) => {
    const {
      isResting,
      reps,
      sets,
      activeTime,
      selectedExercise,
      addSetToHistory,
      stopTimer,
    } = get();

    if (!isResting && reps > 0) {
      addSetToHistory({
        setNumber: sets + 1,
        reps: reps,
        duration: activeTime,
        timestamp: Date.now(),
        exerciseName: selectedExercise?.name || 'Unknown',
      });
      stopTimer();
      set({
        sets: sets + 1,
        reps: 0,
        repsLeft: 0,
        repsRight: 0,
        activeTime: 0,
        selectedExercise: ex,
        isAlternating: ex.type === 'alternating',
      });
    } else {
      set({ selectedExercise: ex, isAlternating: ex.type === 'alternating' });
    }
  },

  setSliderPositionLeft: (pos) => {
    get().processRep(pos, false);
    set({
      sliderPositionLeft: pos,
      lastSliderPosition: pos,
      lastMovementTime: Date.now(),
    });
  },

  setSliderPositionRight: (pos) => {
    get().processRep(pos, true);
    set({
      sliderPositionRight: pos,
      lastSliderPosition: pos,
      lastMovementTime: Date.now(),
    });
  },

  setSliderThreshold: (v) => set({ sliderThreshold: v }),

  incrementLeft: () =>
    set((s) => ({
      repsLeft: s.repsLeft + 1,
      reps: s.reps + (s.isAlternating ? 0.5 : 1),
    })),
  incrementRight: () =>
    set((s) => ({
      repsRight: s.repsRight + 1,
      reps: s.reps + (s.isAlternating ? 0.5 : 1),
    })),

  processRep: (pos: number, isRight: boolean) => {
    const {
      config,
      sliderThreshold,
      lastLeftState,
      lastRightState,
      incrementLeft,
      incrementRight,
      startTimer,
      isResting,
      completeSetOrRest,
    } = get();

    const triggerStart = config.strictMode ? pos > sliderThreshold : pos < 30;
    const triggerEnd = config.strictMode ? pos <= sliderThreshold : pos > 70;

    const lastState = isRight ? lastRightState : lastLeftState;

    if (!lastState && triggerStart) {
      set(isRight ? { lastRightState: true } : { lastLeftState: true });
    }

    if (lastState && triggerEnd) {
      startTimer();
      if (isRight) incrementRight();
      else incrementLeft();
      if (isResting) completeSetOrRest();

      set((s) => ({
        lastLeftState: !isRight ? false : s.lastLeftState,
        lastRightState: isRight ? false : s.lastRightState,
      }));
    }
  },

  setExercises: (exs) => set({ exercises: exs }),

  addSetToHistory: (sr) => set((s) => ({ history: [...s.history, sr] })),
  addRestToHistory: () =>
    set((s) => ({
      history: [
        ...s.history,
        {
          setNumber: 0,
          duration: s.activeTime,
          exerciseName: 'Rest',
          reps: 0,
          timestamp: Date.now(),
        },
      ],
    })),
  clearHistory: () => set({ history: [] }),

  completeSetOrRest: () => {
    const {
      reps,
      activeTime,
      sets,
      selectedExercise,
      addSetToHistory,
      addRestToHistory,
      isResting,
      lastMovementTime,
    } = get();

    if (!isResting) {
      addSetToHistory({
        setNumber: sets + 1,
        reps: reps,
        duration: activeTime,
        timestamp: Date.now(),
        exerciseName: selectedExercise?.name || 'Unknown',
      });

      const timeSinceLastMove = (Date.now() - lastMovementTime) / 1000;

      set({
        sets: sets + 1,
        repsLeft: 0,
        repsRight: 0,
        reps: 0,
        isResting: true,
        activeTime: timeSinceLastMove,
      });
    } else {
      addRestToHistory();
      set({
        isResting: false,
        activeTime: 0,
      });
    }
  },

  reset: () => {
    get().stopTimer();
    set({
      sets: 0,
      repsLeft: 0,
      repsRight: 0,
      reps: 0,
      activeTime: 0,
      isResting: false,
    });
  },
});

export const useStore = create<MachineStore>()(
  subscribeWithSelector(storeCreator)
);
