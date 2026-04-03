import { io, Socket } from 'socket.io-client';
import type { WSEvent } from '@leaderflow/shared';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
    });
  }

  return socket;
}

export function joinOrg(orgId: string): void {
  const s = getSocket();
  s.emit('join:org', orgId);
}

export function onEvent(handler: (event: WSEvent) => void): () => void {
  const s = getSocket();
  s.on('event', handler);
  return () => {
    s.off('event', handler);
  };
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
