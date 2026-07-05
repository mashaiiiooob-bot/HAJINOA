import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerMatchmaking } from './matchmaking.js';
import { registerGameEvents } from './gameSocket.js';
import { registerChatEvents } from './chatSocket.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin, credentials: true },
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  // Reject unauthenticated socket connections at the handshake — never trust an unverified client.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = jwt.verify(token, config.auth.accessTokenSecret);
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug({ userId: socket.userId }, 'socket connected');
    socket.join(`user:${socket.userId}`);

    registerMatchmaking(io, socket);
    registerGameEvents(io, socket);
    registerChatEvents(io, socket);

    socket.on('disconnect', () => {
      logger.debug({ userId: socket.userId }, 'socket disconnected');
    });
  });

  return io;
}
