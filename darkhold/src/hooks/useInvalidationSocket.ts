import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type InvalidationMessage = { type: 'invalidate'; queryKey: string };

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<(msg: InvalidationMessage) => void>();

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function connect(): void {
  if (socket && socket.readyState !== WebSocket.CLOSED) return;

  socket = new WebSocket(getWsUrl());

  socket.onmessage = (e) => {
    try {
      const msg: InvalidationMessage = JSON.parse(e.data);
      handlers.forEach((h) => h(msg));
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
  socket.send(JSON.stringify({ type: 'invalidate', queryKey }));
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
