import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import {
  invalidateAndRefreshMealPlanRedirectWeek,
  MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
} from '../utils/mealPlanRedirect';

type InvalidationMessage = { type: 'invalidate'; queryKey: string };
type VersionMessage = { type: 'version'; version: string };
export type MealAssistantPrecalculationEvent = {
  type: 'meal-assistant-precalculation';
  status: 'started' | 'progress' | 'success' | 'error' | 'skipped' | 'already-running';
  runId: string;
  message: string;
  updatedAt: string;
  detail?: string;
};
type SocketMessage = InvalidationMessage | VersionMessage | MealAssistantPrecalculationEvent;

const RELOAD_VERSION_KEY = 'darkhold_last_reload_version';
const RELOAD_VERSION_PARAM = 'darkhold_reload_version';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<(msg: InvalidationMessage) => void>();
const mealAssistantPrecalculationHandlers = new Set<
  (msg: MealAssistantPrecalculationEvent) => void
>();
const connectHandlers = new Set<() => void>();

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function shouldReloadForVersion(
  serverVersion: string,
  currentVersion: string,
  lastReloadedVersion: string | null,
): boolean {
  return serverVersion !== currentVersion && lastReloadedVersion !== serverVersion;
}

export function getVersionReloadUrl(currentUrl: string, serverVersion: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set(RELOAD_VERSION_PARAM, serverVersion);
  return url.toString();
}

function handleVersionMessage(serverVersion: string): void {
  // Avoid an infinite reload loop: only reload once per server version
  if (
    !shouldReloadForVersion(
      serverVersion,
      __APP_VERSION__,
      sessionStorage.getItem(RELOAD_VERSION_KEY),
    )
  )
    return;
  sessionStorage.setItem(RELOAD_VERSION_KEY, serverVersion);
  window.location.replace(getVersionReloadUrl(window.location.href, serverVersion));
}

function connect(): void {
  if (socket && socket.readyState !== WebSocket.CLOSED) return;

  socket = new WebSocket(getWsUrl());

  socket.onopen = () => {
    connectHandlers.forEach((handler) => handler());
  };

  socket.onmessage = (e) => {
    try {
      const msg: SocketMessage = JSON.parse(e.data);
      if (msg.type === 'version') {
        handleVersionMessage(msg.version);
      } else if (msg.type === 'invalidate') {
        handlers.forEach((h) => h(msg));
      } else if (msg.type === 'meal-assistant-precalculation') {
        mealAssistantPrecalculationHandlers.forEach((h) => h(msg));
      }
    } catch {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    socket = null;
    if (handlers.size > 0 || mealAssistantPrecalculationHandlers.size > 0) {
      reconnectTimer = setTimeout(connect, 5000);
    }
  };
}

export function broadcastInvalidation(queryKey: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type: 'invalidate', queryKey }));
  } catch {
    // ignore send errors — the onclose handler will trigger reconnection
  }
}

export function useMealAssistantPrecalculationSocket(
  onEvent: (event: MealAssistantPrecalculationEvent) => void,
): void {
  useEffect(() => {
    mealAssistantPrecalculationHandlers.add(onEvent);
    connect();

    return () => {
      mealAssistantPrecalculationHandlers.delete(onEvent);
      if (handlers.size === 0 && mealAssistantPrecalculationHandlers.size === 0) {
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        socket?.close();
        socket = null;
      }
    };
  }, [onEvent]);
}

export function useInvalidationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refreshRedirectWeek = () => {
      void invalidateAndRefreshMealPlanRedirectWeek(queryClient, apiGet);
    };

    const handler = (msg: InvalidationMessage) => {
      if (msg.type === 'invalidate') {
        queryClient.invalidateQueries({ queryKey: [msg.queryKey] });
        if (
          msg.queryKey === 'shopping-list' ||
          msg.queryKey === 'meal-plan' ||
          msg.queryKey === MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY
        ) {
          refreshRedirectWeek();
        }
      }
    };

    handlers.add(handler);
    const connectHandler = () => {
      // A reconnect can follow a period where broadcasts were missed. Mark every
      // cache stale so active queries refetch immediately and inactive queries
      // refresh the next time they mount.
      queryClient.invalidateQueries();
      refreshRedirectWeek();
    };
    connectHandlers.add(connectHandler);
    connect();

    return () => {
      handlers.delete(handler);
      connectHandlers.delete(connectHandler);
      if (handlers.size === 0 && mealAssistantPrecalculationHandlers.size === 0) {
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        socket?.close();
        socket = null;
      }
    };
  }, [queryClient]);
}
