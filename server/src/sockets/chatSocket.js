import { ChatModel } from '../models/ChatModel.js';
import { ClanModel } from '../models/ClanModel.js';
import { UserModel } from '../models/UserModel.js';
import { AdminUserModel } from '../models/AdminUserModel.js';
import { ChatService } from '../services/ChatService.js';
import { logger } from '../utils/logger.js';

const lastMessageAt = new Map(); // userId -> timestamp, simple per-connection flood guard
const MIN_INTERVAL_MS = 600;
const typingTimers = new Map(); // `${userId}:${scope}:${scopeRefId}` -> timeout handle

function throttled(userId) {
  const now = Date.now();
  const last = lastMessageAt.get(userId) || 0;
  if (now - last < MIN_INTERVAL_MS) return true;
  lastMessageAt.set(userId, now);
  return false;
}

export function registerChatEvents(io, socket) {
  /**
   * Global / clan / match / spectator chat. Spectator chat piggybacks on the same
   * `match:{matchId}` room match chat already uses — spectators join that room via
   * gameSocket/matchmaking the same way players do.
   */
  socket.on('chat:send', async ({ scope = 'global', scopeRefId = null, body }) => {
    const text = ChatModel.sanitize(body);
    if (!text) return;
    if (throttled(socket.userId)) return; // silently drop — basic spam throttle

    try {
      const muted = await AdminUserModel.isMuted(socket.userId);
      if (muted) {
        socket.emit('chat:error', { message: 'شما توسط مدیریت بی‌صدا شده‌اید' });
        return;
      }

      if (scope === 'clan') {
        const membership = await ClanModel.getMembership(scopeRefId, socket.userId);
        if (!membership) {
          socket.emit('chat:error', { message: 'شما عضو این کلن نیستید' });
          return;
        }
      }

      const [user, message] = await Promise.all([
        UserModel.findById(socket.userId),
        ChatModel.insertMessage({ scope, scopeRefId, userId: socket.userId, body: text }),
      ]);

      const payload = {
        id: message.id,
        scope,
        scopeRefId,
        body: text,
        user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        createdAt: message.createdAt,
      };

      if (scope === 'global') io.emit('chat:message', payload);
      else io.to(`${scope}:${scopeRefId}`).emit('chat:message', payload);
    } catch (err) {
      logger.error({ err }, 'Failed to persist chat message');
      socket.emit('chat:error', { message: 'ارسال پیام ناموفق بود' });
    }
  });

  /** Lets a client subscribe to a scoped room (clan/match) without sending a message. */
  socket.on('chat:watch', async ({ scope, scopeRefId }) => {
    if (!scope || scope === 'global') return;
    if (scope === 'clan') {
      const membership = await ClanModel.getMembership(scopeRefId, socket.userId).catch(() => null);
      if (!membership) return;
    }
    socket.join(`${scope}:${scopeRefId}`);
  });

  socket.on('chat:unwatch', ({ scope, scopeRefId }) => {
    if (!scope || scope === 'global') return;
    socket.leave(`${scope}:${scopeRefId}`);
  });

  /** Ephemeral typing indicator — never persisted, auto-clears after 4s of silence. */
  socket.on('chat:typing', ({ scope = 'global', scopeRefId = null }) => {
    const key = `${socket.userId}:${scope}:${scopeRefId}`;
    const room = scope === 'global' ? null : `${scope}:${scopeRefId}`;
    const payload = { scope, scopeRefId, userId: socket.userId };

    const emitTo = room ? io.to(room) : io;
    emitTo.emit('chat:typing', payload);

    clearTimeout(typingTimers.get(key));
    typingTimers.set(
      key,
      setTimeout(() => {
        emitTo.emit('chat:typing:stop', payload);
        typingTimers.delete(key);
      }, 4000)
    );
  });

  /** Private direct messages — delivered live to both parties' `user:{id}` rooms. */
  socket.on('dm:send', async ({ recipientId, body } = {}) => {
    try {
      const message = await ChatService.sendDirectMessage(socket.userId, recipientId, body);
      io.to(`user:${recipientId}`).emit('dm:message', message);
      io.to(`user:${socket.userId}`).emit('dm:message', message);
    } catch (err) {
      socket.emit('chat:error', { message: err.message || 'ارسال پیام ناموفق بود' });
    }
  });

  socket.on('disconnect', () => {
    for (const key of typingTimers.keys()) {
      if (key.startsWith(`${socket.userId}:`)) {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
      }
    }
  });
}
