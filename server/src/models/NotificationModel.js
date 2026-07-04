import { query } from '../config/database.js';

export const NotificationModel = {
  async create({ userId, type, payload = {} }) {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3)
       RETURNING id, user_id AS "userId", type, payload, read_at AS "readAt", created_at AS "createdAt"`,
      [userId, type, JSON.stringify(payload)]
    );
    return rows[0];
  },

  async listForUser(userId, { limit = 30, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT id, type, payload, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  },

  async unreadCount(userId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return rows[0].count;
  },

  async markRead(userId, notificationId) {
    const { rows } = await query(
      `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
      [notificationId, userId]
    );
    return rows[0] || null;
  },

  async markAllRead(userId) {
    await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  },
};
