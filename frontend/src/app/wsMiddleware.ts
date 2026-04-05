import { createAction } from '@reduxjs/toolkit';
import type { Middleware } from '@reduxjs/toolkit';
import {
  setLastMessageTime,
  setSliderPositionLeft,
  setSliderPositionRight,
  setWsStatus,
  setCalibrationEvent,
} from './store';
import { applyRepCompleted } from './store';

export const wsConnect = createAction('ws/connect');
export const wsDisconnect = createAction('ws/disconnect');
export const wsSendThresholds = createAction<{
  threshold: number;
  repBand: number;
}>('ws/sendThresholds');

const HANDSHAKE_INTERVAL_MS = 15000;

export const createWsMiddleware = (): Middleware => {
  return (store) => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let reconnectAttempt = 0;
    let handshakeExpired = false;
    let errored = false;
    let intentionalClose = false;

    const dispatch: (...args: any[]) => any = store.dispatch;

    const getUrl = () => {
      const host = window.location.href.split('/')[2];
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${host}/ws`;
    };

    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      reconnectAttempt++;
      const delay = Math.min(10000, 1000 * reconnectAttempt);
      reconnectTimer = window.setTimeout(() => connect(), delay);
    };

    const connect = () => {
      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN)
      ) {
        return;
      }

      cleanup();
      errored = false;
      intentionalClose = false;
      dispatch(
        setWsStatus({ readyState: WebSocket.CONNECTING, errored: false })
      );

      socket = new WebSocket(getUrl());

      socket.onopen = () => {
        reconnectAttempt = 0;
        handshakeExpired = false;
        dispatch(setLastMessageTime(Date.now()));
        dispatch(setWsStatus({ readyState: WebSocket.OPEN, errored: false }));

        heartbeatTimer = window.setInterval(() => {
          const state = store.getState() as {
            machine: { lastMessageTime: number };
          };
          const { lastMessageTime } = state.machine;
          const elapsed = Date.now() - lastMessageTime;
          if (elapsed <= HANDSHAKE_INTERVAL_MS || handshakeExpired) return;
          handshakeExpired = true;
          socket?.close();
        }, 1000);
      };

      socket.onerror = () => {
        errored = true;
      };

      socket.onclose = () => {
        cleanup();
        dispatch(setWsStatus({ readyState: WebSocket.CLOSED, errored }));
        errored = false;
        if (!intentionalClose) scheduleReconnect();
      };

      socket.onmessage = (e) => {
        const data: {
          event?: 'position' | 'rep' | 'threshold' | 'handshake';
          name: string;
          calibrated: number;
          cal_state: 'idle' | 'seek_max' | 'done';
        } = JSON.parse(e.data);

        dispatch(setLastMessageTime(Date.now()));
        handshakeExpired = false;

        if (data.event === 'handshake') return;

        const eventType = data.event ?? 'position';

        if (eventType === 'rep') {
          if (data.name === 'right' || data.name === 'left') {
            dispatch(applyRepCompleted(data.name));
          }
          return;
        }

        if (eventType === 'position') {
          const calibrated = Math.min(Math.max(0, data.calibrated ?? 0), 100);
          if (data.name === 'right')
            dispatch(setSliderPositionRight(calibrated));
          else dispatch(setSliderPositionLeft(calibrated));

          if (data.cal_state === 'seek_max' || data.cal_state === 'idle') {
            dispatch(
              setCalibrationEvent({ name: data.name, state: data.cal_state })
            );
          }
        }
      };
    };

    const disconnect = () => {
      cleanup();
      intentionalClose = true;
      if (socket) {
        socket.close();
        socket = null;
      }
    };

    const send = (msg: string) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(msg);
    };

    return (next) => (action) => {
      if (wsConnect.match(action)) {
        connect();
      } else if (wsDisconnect.match(action)) {
        disconnect();
      } else if (wsSendThresholds.match(action)) {
        const { threshold, repBand } = action.payload;
        const clamped = Math.min(Math.max(0, threshold), 100);
        send(
          JSON.stringify({
            event: 'threshold',
            name: 'left',
            threshold: clamped,
            repBand,
          })
        );
        send(
          JSON.stringify({
            event: 'threshold',
            name: 'right',
            threshold: clamped,
            repBand,
          })
        );
      }

      return next(action);
    };
  };
};
