import { selectConfig, selectHistory, selectUsers, store } from './store';

export function initMachineStoreSubscriptions() {
  if (typeof window === 'undefined') return;

  let prevHistory = selectHistory(store.getState());
  let prevConfig = selectConfig(store.getState());
  let prevUsers = selectUsers(store.getState());

  store.subscribe(() => {
    const state = store.getState();
    const history = selectHistory(state);
    const config = selectConfig(state);
    const users = selectUsers(state);

    if (history !== prevHistory) {
      localStorage.setItem('workout_history_records', JSON.stringify(history));
      prevHistory = history;
    }

    if (config !== prevConfig) {
      localStorage.setItem('app_settings', JSON.stringify(config));
      prevConfig = config;
    }

    if (users !== prevUsers) {
      localStorage.setItem('users', JSON.stringify(users));
      prevUsers = users;
    }
  });
}
