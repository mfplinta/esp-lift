import { useStore } from './store';

export function initMachineStoreSubscriptions() {
  (useStore.subscribe(
    (s) => s.history,
    (v, prev) => {
      localStorage.setItem('workout_history_records', JSON.stringify(v));
    }
  ),
    useStore.subscribe(
      (s) => s.config,
      (v, prev) => {
        localStorage.setItem('app_settings', JSON.stringify(v));
      }
    ));
}
