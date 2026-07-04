import { ChatModel } from '../models/ChatModel.js';
import { presence } from '../sockets/presence.js';
import { NotificationService } from './NotificationService.js';
import { errors } from '../utils/AppError.js';

const DM_MIN_INTERVAL_MS = 500;
const lastDmAt = new Map(); // userId -> timestamp, basic anti-spam for REST fallback

export const ChatService = {
  async globalHistory(limit = 50) {
    return ChatModel.history('global', null, limit);
  },

  async matchHistory(matchId, limit = 100) {
    return ChatModel.history('match', matchId, limit);
  },

  async onlineUsers() {
    const ids = presence.onlineUserIds();
    const users = await ChatModel.hydrateUsers(ids.slice(0, 200));
    return users;
  },

  /** sendDirectMessage() — persists + notifies; the socket layer handles live delivery. */
  async sendDirectMessage(senderId, recipientId, body) {
    if (senderId === recipientId) throw errors.validation('نمی‌توانید به خودتان پیام دهید');

    const now = Date.now();
    const last = lastDmAt.get(senderId) || 0;
    if (now - last < DM_MIN_INTERVAL_MS) throw errors.conflict('لطفاً کمی صبر کنید');
    lastDmAt.set(senderId, now);

    const text = ChatModel.sanitize(body);
    if (!text) throw errors.validation('پیام نمی‌تواند خالی باشد');

    const message = await ChatModel.sendDirectMessage(senderId, recipientId, text);

    if (!presence.isOnline(recipientId)) {
      await NotificationService.send(recipientId, 'direct_message', {
        fromUserId: senderId,
        preview: text.slice(0, 80),
      });
    }

    return message;
  },

  async conversation(userId, otherUserId, limit = 50) {
    const rows = await ChatModel.conversation(userId, otherUserId, limit);
    await ChatModel.markConversationRead(userId, otherUserId);
    return rows;
  },

  async listConversations(userId) {
    const conversations = await ChatModel.listConversations(userId);
    return conversations.map((c) => ({ ...c, isOnline: presence.isOnline(c.userId) }));
  },

  async unreadDmCount(userId) {
    return ChatModel.unreadDmCount(userId);
  },
};
