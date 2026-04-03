import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { WSEvent } from '@leaderflow/shared';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.WEB_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    socket.on('join:org', (orgId: string) => {
      socket.join(`org:${orgId}`);
      console.log(`[socket] ${socket.id} joined org:${orgId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO server not initialized');
  }
  return io;
}

export function emitToOrg(orgId: string, event: WSEvent): void {
  if (!io) return;
  io.to(`org:${orgId}`).emit('event', event);
}
