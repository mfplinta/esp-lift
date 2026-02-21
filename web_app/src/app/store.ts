import {
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { Action } from 'redux';
import type { ThunkAction } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { setupListeners } from '@reduxjs/toolkit/query';
import { Category, Exercise, SetRecord, AppConfig, User } from './models';
import { espApi } from './services/espApi';

type MachineState = {
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
  lastMessageTime: number;
  timerIntervalId: number | null;
  reps: number;
  isAlternating: boolean;

  /* Storage */
  exercises: Exercise[];
  categories: Category[];
  history: SetRecord[];
  isHistoryHydrated: boolean;

  /* Config */
  config: AppConfig;
  isConfigHydrated: boolean;

  /* Users */
  users: User[];
  selectedUser?: User;
  isUsersHydrated: boolean;
};

const initialState: MachineState = {
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
  lastMessageTime: Date.now(),
  timerIntervalId: null,
  reps: 0,
  isAlternating: false,
  exercises: [],
  categories: [],
  history: [],
  isHistoryHydrated: false,
  config: {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
    strictMode: false,
    autoCompleteSecs: 0,
    debugMode: false,
  },
  isConfigHydrated: false,
  users: [{ name: 'Default User', color: '#4F46E5' }],
  selectedUser: undefined,
  isUsersHydrated: false,
};

const machineSlice = createSlice({
  name: 'machine',
  initialState,
  reducers: {
    mergeState: (state, action: PayloadAction<Partial<MachineState>>) => {
      Object.assign(state, action.payload);
    },
    setSelectedExerciseState: (
      state,
      action: PayloadAction<Exercise | undefined>
    ) => {
      state.selectedExercise = action.payload;
      if (action.payload) {
        state.isAlternating = action.payload.type === 'alternating';
        state.sliderThreshold = action.payload.thresholdPercentage;
      }
    },
    setSliderPositionLeft: (state, action: PayloadAction<number>) => {
      state.sliderPositionLeft = action.payload;
      state.lastSliderPosition = action.payload;
      state.lastMovementTime = Date.now();
    },
    setSliderPositionRight: (state, action: PayloadAction<number>) => {
      state.sliderPositionRight = action.payload;
      state.lastSliderPosition = action.payload;
      state.lastMovementTime = Date.now();
    },
    setSliderThreshold: (state, action: PayloadAction<number>) => {
      state.sliderThreshold = action.payload;
    },
    incrementLeft: (state) => {
      state.repsLeft += 1;
      state.reps += state.isAlternating ? 0.5 : 1;
    },
    incrementRight: (state) => {
      state.repsRight += 1;
      state.reps += state.isAlternating ? 0.5 : 1;
    },
    setLastMessageTime: (state, action: PayloadAction<number>) => {
      state.lastMessageTime = action.payload;
    },
    setLastMovementTime: (state, action: PayloadAction<number>) => {
      state.lastMovementTime = action.payload;
    },
    setTimerIntervalId: (state, action: PayloadAction<number | null>) => {
      state.timerIntervalId = action.payload;
    },
    incrementActiveTime: (state, action: PayloadAction<number>) => {
      state.activeTime += action.payload;
    },
    setExerciseData: (
      state,
      action: PayloadAction<{ exercises: Exercise[]; categories: Category[] }>
    ) => {
      state.exercises = action.payload.exercises;
      state.categories = action.payload.categories;
    },
    addSetToHistory: (state, action: PayloadAction<SetRecord>) => {
      state.history.push(action.payload);
    },
    clearHistory: (state) => {
      state.history = [];
    },
    setHistory: (state, action: PayloadAction<SetRecord[]>) => {
      state.history = action.payload;
    },
    setHistoryHydrated: (state, action: PayloadAction<boolean>) => {
      state.isHistoryHydrated = action.payload;
    },
    setConfigState: (state, action: PayloadAction<AppConfig>) => {
      state.config = action.payload;
    },
    updateConfig: (state, action: PayloadAction<Partial<AppConfig>>) => {
      state.config = { ...state.config, ...action.payload };
    },
    toggleTheme: (state) => {
      state.config = {
        ...state.config,
        theme: state.config.theme === 'light' ? 'dark' : 'light',
      };
    },
    setConfigHydrated: (state, action: PayloadAction<boolean>) => {
      state.isConfigHydrated = action.payload;
    },
    setUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload;
    },
    addUser: (
      state,
      action: PayloadAction<{ name: string; color: string }>
    ) => {
      state.users.push({
        name: action.payload.name,
        color: action.payload.color,
      });
    },
    deleteUser: (state, action: PayloadAction<string>) => {
      state.users = state.users.filter((u) => u.name !== action.payload);
      if (state.selectedUser?.name === action.payload) {
        state.selectedUser = undefined;
      }
    },
    selectUser: (state, action: PayloadAction<string>) => {
      state.selectedUser = state.users.find((u) => u.name === action.payload);
    },
    setUsersHydrated: (state, action: PayloadAction<boolean>) => {
      state.isUsersHydrated = action.payload;
    },
    updateExerciseThreshold: (
      state,
      action: PayloadAction<{ name: string; thresholdPercentage: number }>
    ) => {
      if (state.selectedExercise?.name === action.payload.name) {
        state.selectedExercise = {
          ...state.selectedExercise,
          thresholdPercentage: action.payload.thresholdPercentage,
        };
      }
      const exercise = state.exercises.find(
        (ex) => ex.name === action.payload.name
      );
      if (exercise) {
        exercise.thresholdPercentage = action.payload.thresholdPercentage;
      }
    },
  },
});

export const store = configureStore({
  reducer: {
    machine: machineSlice.reducer,
    [espApi.reducerPath]: espApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(espApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action
>;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export const selectConfig = (state: RootState) => state.machine.config;
export const selectHistory = (state: RootState) => state.machine.history;
export const selectUsers = (state: RootState) => state.machine.users;

const {
  mergeState,
  setSelectedExerciseState,
  setSliderPositionLeft,
  setSliderPositionRight,
  setSliderThreshold,
  incrementLeft,
  incrementRight,
  setLastMessageTime,
  setLastMovementTime,
  setTimerIntervalId,
  incrementActiveTime,
  setExerciseData,
  addSetToHistory,
  clearHistory,
  setHistory,
  setHistoryHydrated,
  setConfigState,
  updateConfig,
  toggleTheme,
  setConfigHydrated,
  setUsers,
  addUser,
  deleteUser,
  selectUser,
  setUsersHydrated,
  updateExerciseThreshold,
} = machineSlice.actions;

export {
  setSliderPositionLeft,
  setSliderPositionRight,
  setSliderThreshold,
  setLastMessageTime,
  setExerciseData,
  updateConfig as setConfig,
  toggleTheme,
  addUser,
  deleteUser,
  selectUser,
  clearHistory,
  updateExerciseThreshold,
};

export const clearHistoryForDate =
  (dateStr: string, userName?: string): AppThunk =>
  (dispatch, getState) => {
    const filtered = getState().machine.history.filter((record) => {
      if (userName && record.userName !== userName) return true;
      return new Date(record.timestamp).toDateString() !== dateStr;
    });
    dispatch(setHistory(filtered));
  };

export const clearAllHistory =
  (userName?: string): AppThunk =>
  (dispatch, getState) => {
    if (!userName) {
      dispatch(clearHistory());
      return;
    }
    const filtered = getState().machine.history.filter(
      (record) => record.userName !== userName
    );
    dispatch(setHistory(filtered));
  };

export const hydrateSetHistory = (): AppThunk => (dispatch, getState) => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('workout_history_records');
    if (saved) {
      try {
        dispatch(setHistory(JSON.parse(saved)));
      } catch {}
    }
  }
  dispatch(setHistoryHydrated(true));
};

export const hydrateConfig = (): AppThunk => (dispatch, getState) => {
  if (typeof window !== 'undefined') {
    const savedConfig = localStorage.getItem('app_settings');
    if (savedConfig) {
      try {
        dispatch(setConfigState(JSON.parse(savedConfig)));
        dispatch(setConfigHydrated(true));
        return;
      } catch {}
    } else {
      localStorage.setItem(
        'app_settings',
        JSON.stringify(getState().machine.config)
      );
    }
  }
  dispatch(setConfigHydrated(true));
};

export const hydrateUsers = (): AppThunk => (dispatch, getState) => {
  if (typeof window !== 'undefined') {
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
      try {
        dispatch(setUsers(JSON.parse(savedUsers)));
        dispatch(setUsersHydrated(true));
        return;
      } catch {}
    } else {
      localStorage.setItem('users', JSON.stringify(getState().machine.users));
    }
  }
  dispatch(setUsersHydrated(true));
};

const resolveExerciseNameForSet = (state: MachineState): string | undefined => {
  if (state.selectedExercise && state.selectedExercise.name)
    return state.selectedExercise.name;

  const today = new Date().toDateString();
  const userName = state.selectedUser?.name;
  for (let i = state.history.length - 1; i >= 0; i--) {
    const rec = state.history[i];
    if (new Date(rec.timestamp).toDateString() !== today) continue;
    if (userName && rec.userName !== userName) continue;
    if (rec.exerciseName && rec.exerciseName !== 'Rest')
      return rec.exerciseName;
  }

  if (state.exercises && state.exercises.length > 0)
    return state.exercises[0].name;

  return undefined;
};

export const startTimer = (): AppThunk => (dispatch, getState) => {
  const { timerIntervalId } = getState().machine;
  if (timerIntervalId) return;

  const id = window.setInterval(() => {
    dispatch(tick());
  }, 100);

  dispatch(setTimerIntervalId(id));
};

export const stopTimer = (): AppThunk => (dispatch, getState) => {
  const { timerIntervalId } = getState().machine;
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
  }
  dispatch(setTimerIntervalId(null));
};

export const tick = (): AppThunk => (dispatch, getState) => {
  const state = getState().machine;
  dispatch(incrementActiveTime(0.1));

  if (!state.isResting && state.reps > 0 && state.config.autoCompleteSecs > 0) {
    const secondsSinceMovement = (Date.now() - state.lastMovementTime) / 1000;
    if (secondsSinceMovement >= state.config.autoCompleteSecs) {
      dispatch(completeSetOrRest());
    }
  }
};

export const applyRepCompleted =
  (side: 'left' | 'right'): AppThunk =>
  (dispatch, getState) => {
    dispatch(startTimer());
    if (side === 'right') {
      dispatch(incrementRight());
    } else {
      dispatch(incrementLeft());
    }

    const state = getState().machine;
    const repTarget = state.selectedExercise?.thresholdPercentage ?? 0;

    // If reps exceed or equal target, increment set and add to history
    if (!state.isResting && state.reps >= repTarget && repTarget > 0) {
      const exerciseName = resolveExerciseNameForSet(state) || 'Unknown';
      const nextSetNumber = (state.sets || 0) + 1;
      dispatch(
        addSetToHistory({
          reps: state.reps,
          duration: state.activeTime,
          timestamp: Date.now(),
          exerciseName: exerciseName,
          userName: state.selectedUser?.name,
        })
      );
      dispatch(stopTimer());
      dispatch(
        mergeState({
          sets: nextSetNumber,
          reps: 0,
          repsLeft: 0,
          repsRight: 0,
          activeTime: 0,
        })
      );
    }

    if (state.isResting) {
      dispatch(completeSetOrRest());
    }
    dispatch(setLastMovementTime(Date.now()));
  };

export const setSelectedExercise =
  (exercise: Exercise): AppThunk =>
  (dispatch, getState) => {
    const state = getState().machine;

    if (!state.isResting && state.reps > 0) {
      const exerciseName = state.selectedExercise?.name || 'Unknown';
      const nextSetNumber = (state.sets || 0) + 1;

      dispatch(
        addSetToHistory({
          reps: state.reps,
          duration: state.activeTime,
          timestamp: Date.now(),
          exerciseName: exerciseName,
          userName: state.selectedUser?.name,
        })
      );
      dispatch(stopTimer());
      dispatch(
        mergeState({
          sets: nextSetNumber,
          reps: 0,
          repsLeft: 0,
          repsRight: 0,
          activeTime: 0,
          sliderThreshold: exercise.thresholdPercentage,
          selectedExercise: exercise,
          isAlternating: exercise.type === 'alternating',
        })
      );
      return;
    }

    // When selecting an exercise without finishing current set, just set selected exercise
    dispatch(setSelectedExerciseState(exercise));
  };

export const completeSetOrRest = (): AppThunk => (dispatch, getState) => {
  const state = getState().machine;

  if (!state.isResting) {
    const exerciseName = resolveExerciseNameForSet(state) || 'Unknown';
    const nextSetNumber = (state.sets || 0) + 1;

    dispatch(
      addSetToHistory({
        reps: state.reps,
        duration: state.activeTime,
        timestamp: Date.now(),
        exerciseName: exerciseName,
        userName: state.selectedUser?.name,
      })
    );

    const timeSinceLastMove = (Date.now() - state.lastMovementTime) / 1000;
    dispatch(
      mergeState({
        sets: nextSetNumber,
        repsLeft: 0,
        repsRight: 0,
        reps: 0,
        isResting: true,
        activeTime: timeSinceLastMove,
      })
    );
    return;
  }

  dispatch(
    addSetToHistory({
      duration: state.activeTime,
      exerciseName: 'Rest',
      reps: 0,
      timestamp: Date.now(),
      userName: state.selectedUser?.name,
    })
  );
  dispatch(
    mergeState({
      isResting: false,
      activeTime: 0,
    })
  );
};
export const reset = (): AppThunk => (dispatch) => {
  dispatch(stopTimer());
  dispatch(
    mergeState({
      sets: 0,
      repsLeft: 0,
      repsRight: 0,
      reps: 0,
      activeTime: 0,
      isResting: false,
    })
  );
};
