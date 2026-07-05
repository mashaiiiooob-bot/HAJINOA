import { query } from '../config/database.js';
import { UserModel } from '../models/UserModel.js';
import { logger } from '../utils/logger.js';

const lastMessageAt = new Map(); // userId -> timestamp, simple per-connection flood guard
const MIN_INTERVAL_MS = 600;

function sanitize(text) {
  // Strip tags entirely — chat is plain text only, never rendered as HTML on the client.
  return text.replace(/<[^>]*>/g, '').trim().slice(0, 500);
}

export function registerChatEvents(io, socket) {
  socket.on('chat:send', async ({ scope = 'global', scopeRefId = null, body }) => {
    const text = sanitize(String(body || ''));
    if (!text) return;

    const now = Date.now();
    const last = lastMessageAt.get(socket.userId) || 0;
    if (now - last < MIN_INTERVAL_MS) return; // silently drop — basic spam throttle
    lastMessageAt.set(socket.userId, now);

    try {
      const [user] = await Promise.all([UserModel.findById(socket.userId)]);
      await query(
        `INSERT INTO chat_messages (scope, scope_ref_id, user_id, body) VALUES ($1, $2, $3, $4)`,
        [scope, scopeRefId, socket.userId, text]
      );

      const payload = {
        scope,
        scopeRefId,
        body: text,
        user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        createdAt: new Date().toISOString(),
      };

      if (scope === 'global') io.emit('chat:message', payload);
      else io.to(`${scope}:${scopeRefId}`).emit('chat:message', payload);
    } catch (err) {
      logger.error({ err }, 'Failed to persist chat message');
    }
  });
}
