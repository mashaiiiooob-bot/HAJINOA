import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerMatchmaking } from './matchmaking.js';
import { registerGameEvents } from './gameSocket.js';
import { registerChatEvents } from './chatSocket.js';
import { registerTournamentEvents } from './tournamentSocket.js';
import { registerClanEvents, autoJoinClanRoom } from './clanSocket.js';
import { registerFriendEvents, broadcastPresence } from './friendSocket.js';
import { presence } from './presence.js';
import { setIo } from './notifier.js';
import { UserModel } from '../models/UserModel.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.cors.origin, credentials: true },
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  setIo(io); // lets REST-triggered services (Clan/Friend/Notification) push realtime events too

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
    registerTournamentEvents(io, socket);
    registerClanEvents(io, socket);
    registerFriendEvents(io, socket);

    autoJoinClanRoom(socket);

    const cameOnline = presence.markOnline(socket.userId);
    if (cameOnline) broadcastPresence(socket.userId, true);

    socket.on('disconnect', () => {
      logger.debug({ userId: socket.userId }, 'socket disconnected');
      const wentOffline = presence.markOffline(socket.userId);
      if (wentOffline) {
        UserModel.touchLastSeen(socket.userId).catch((err) =>
          logger.error({ err, userId: socket.userId }, 'Failed to update last_seen_at')
        );
        broadcastPresence(socket.userId, false);
      }
    });
  });

  return io;
}
