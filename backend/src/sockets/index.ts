import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Minimal bootstrap for now (room join/leave + log/stat event wiring lands
 * with the orchestrators in a later milestone) - exists so index.ts has a
 * single http.Server shared by Express and Socket.io from the start.
 */
export function attachSockets(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');
    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'socket disconnected');
    });
  });

  return io;
}
