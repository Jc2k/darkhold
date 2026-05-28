import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY } from '../utils/mealPlanRedirect';

type InvalidationMessage = { type: 'invalidate'; queryKey: string };
type VersionMessage = { type: 'version'; version: string };
type SocketMessage = InvalidationMessage | VersionMessage;

const RELOAD_VERSION_KEY = 'darkhold_last_reload_version';
const RELOAD_VERSION_PARAM = 'darkhold_reload_version';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<(msg: InvalidationMessage) => void>();
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
      } else {
        handlers.forEach((h) => h(msg));
      }
    } catch {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    socket = null;
    if (handlers.size > 0) {
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

export function useInvalidationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (msg: InvalidationMessage) => {
      if (msg.type === 'invalidate') {
        queryClient.invalidateQueries({ queryKey: [msg.queryKey] });
      }
    };

    handlers.add(handler);
    const connectHandler = () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      queryClient.invalidateQueries({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY });
    };
    connectHandlers.add(connectHandler);
    connect();

    return () => {
      handlers.delete(handler);
      connectHandlers.delete(connectHandler);
      if (handlers.size === 0) {
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
