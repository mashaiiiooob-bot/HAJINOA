import { query } from '../config/database.js';

export const ChatModel = {
  /** Strips tags entirely — chat is plain text only, never rendered as HTML on the client. */
  sanitize(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 500);
  },

  async insertMessage({ scope, scopeRefId, userId, body }) {
    const { rows } = await query(
      `INSERT INTO chat_messages (scope, scope_ref_id, user_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, scope, scope_ref_id AS "scopeRefId", user_id AS "userId", body, created_at AS "createdAt"`,
      [scope, scopeRefId, userId, body]
    );
    return rows[0];
  },

  async history(scope, scopeRefId, limit = 50) {
    const { rows } = await query(
      `SELECT cm.id, cm.scope, cm.scope_ref_id AS "scopeRefId", cm.body, cm.created_at AS "createdAt",
              u.id AS "userId", u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.scope = $1 AND cm.scope_ref_id ${scopeRefId ? '= $2' : 'IS NULL'}
       ORDER BY cm.created_at DESC
       LIMIT ${scopeRefId ? '$3' : '$2'}`,
      scopeRefId ? [scope, scopeRefId, limit] : [scope, limit]
    );
    return rows.reverse();
  },

  /* ----------------------------------------------------------- Direct messages */

  async sendDirectMessage(senderId, recipientId, body) {
    const { rows } = await query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id AS "senderId", recipient_id AS "recipientId", body,
                 read_at AS "readAt", created_at AS "createdAt"`,
      [senderId, recipientId, body]
    );
    return rows[0];
  },

  async conversation(userId, otherUserId, limit = 50) {
    const { rows } = await query(
      `SELECT id, sender_id AS "senderId", recipient_id AS "recipientId", body,
              read_at AS "readAt", created_at AS "createdAt"
       FROM direct_messages
       WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, otherUserId, limit]
    );
    return rows.reverse();
  },

  async listConversations(userId) {
    const { rows } = await query(
      `SELECT DISTINCT ON (other.id)
              other.id AS "userId", other.username, other.display_name AS "displayName", other.avatar_url AS "avatarUrl",
              dm.body AS "lastMessage", dm.created_at AS "lastMessageAt", dm.sender_id AS "lastSenderId",
              (SELECT COUNT(*) FROM direct_messages u2
                 WHERE u2.sender_id = other.id AND u2.recipient_id = $1 AND u2.read_at IS NULL)::int AS "unreadCount"
       FROM direct_messages dm
       JOIN users other ON other.id = CASE WHEN dm.sender_id = $1 THEN dm.recipient_id ELSE dm.sender_id END
       WHERE dm.sender_id = $1 OR dm.recipient_id = $1
       ORDER BY other.id, dm.created_at DESC`,
      [userId]
    );
    return rows.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  },

  async markConversationRead(userId, otherUserId) {
    await query(
      `UPDATE direct_messages SET read_at = now()
       WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [userId, otherUserId]
    );
  },

  async unreadDmCount(userId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return rows[0].count;
  },

  /* --------------------------------------------------------------- Presence */

  async hydrateUsers(userIds) {
    if (!userIds.length) return [];
    const { rows } = await query(
      `SELECT id, username, display_name AS "displayName", avatar_url AS "avatarUrl", level
       FROM users WHERE id = ANY($1::uuid[])`,
      [userIds]
    );
    return rows;
  },
};
