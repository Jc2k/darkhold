import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type InvalidationMessage = { type: 'invalidate'; queryKey: string };
type VersionMessage = { type: 'version'; version: string };
type SocketMessage = InvalidationMessage | VersionMessage;

const RELOAD_VERSION_KEY = 'darkhold_last_reload_version';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<(msg: InvalidationMessage) => void>();

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // When accessed via Home Assistant ingress, nginx injects __HA_BASE_PATH__
  // from the X-Ingress-Path header so the WebSocket URL includes the ingress
  // prefix (e.g. /api/hassio_ingress/<token>/ws).  For direct access the
  // variable is absent and the URL resolves to the bare /ws path.
  const basePath = window.__HA_BASE_PATH__ ?? '';
  return `${protocol}//${window.location.host}${basePath}/ws`;
}

function handleVersionMessage(serverVersion: string): void {
  if (serverVersion === __APP_VERSION__) return;
  // Avoid an infinite reload loop: only reload once per server version
  if (sessionStorage.getItem(RELOAD_VERSION_KEY) === serverVersion) return;
  sessionStorage.setItem(RELOAD_VERSION_KEY, serverVersion);
  window.location.reload();
}

function connect(): void {
  if (socket && socket.readyState !== WebSocket.CLOSED) return;

  socket = new WebSocket(getWsUrl());

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
    connect();

    return () => {
      handlers.delete(handler);
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
