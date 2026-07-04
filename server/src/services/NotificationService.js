import { NotificationModel } from '../models/NotificationModel.js';
import { notifyUser } from '../sockets/notifier.js';

export const NotificationService = {
  /** Persists a notification and, if the recipient is connected, pushes it live. */
  async send(userId, type, payload = {}) {
    const notification = await NotificationModel.create({ userId, type, payload });
    notifyUser(userId, 'notification:new', notification);
    return notification;
  },

  async list(userId, page = 1, pageSize = 30) {
    const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 50);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const [items, unreadCount] = await Promise.all([
      NotificationModel.listForUser(userId, { limit, offset }),
      NotificationModel.unreadCount(userId),
    ]);
    return { items, unreadCount };
  },

  async markRead(userId, notificationId) {
    return NotificationModel.markRead(userId, notificationId);
  },

  async markAllRead(userId) {
    await NotificationModel.markAllRead(userId);
  },
};
