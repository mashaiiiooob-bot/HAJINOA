import { query } from '../config/database.js';

export const FriendModel = {
  async findActiveBetween(userA, userB) {
    const { rows } = await query(
      `SELECT id, requester_id AS "requesterId", addressee_id AS "addresseeId", status
       FROM friendships
       WHERE status IN ('pending', 'accepted')
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [userA, userB]
    );
    return rows[0] || null;
  },

  async create(requesterId, addresseeId) {
    const { rows } = await query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')
       RETURNING id, requester_id AS "requesterId", addressee_id AS "addresseeId", status, created_at AS "createdAt"`,
      [requesterId, addresseeId]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT id, requester_id AS "requesterId", addressee_id AS "addresseeId", status,
              created_at AS "createdAt", responded_at AS "respondedAt"
       FROM friendships WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async setStatus(id, status) {
    const { rows } = await query(
      `UPDATE friendships SET status = $2, responded_at = now() WHERE id = $1
       RETURNING id, requester_id AS "requesterId", addressee_id AS "addresseeId", status`,
      [id, status]
    );
    return rows[0] || null;
  },

  async deleteAccepted(userA, userB) {
    const { rowCount } = await query(
      `DELETE FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [userA, userB]
    );
    return rowCount > 0;
  },

  async listFriends(userId) {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
              u.level, u.last_seen_at AS "lastSeenAt", f.id AS "friendshipId", f.responded_at AS "friendsSince"
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY u.display_name ASC`,
      [userId]
    );
    return rows;
  },

  async friendIds(userId) {
    const { rows } = await query(
      `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS "friendId"
       FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
      [userId]
    );
    return rows.map((r) => r.friendId);
  },

  async listIncoming(userId) {
    const { rows } = await query(
      `SELECT f.id AS "friendshipId", f.created_at AS "createdAt",
              u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.level
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async listOutgoing(userId) {
    const { rows } = await query(
      `SELECT f.id AS "friendshipId", f.created_at AS "createdAt",
              u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.level
       FROM friendships f
       JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async search(currentUserId, term, limit = 20) {
    const { rows } = await query(
      `SELECT id, username, display_name AS "displayName", avatar_url AS "avatarUrl", level
       FROM users
       WHERE id <> $1 AND status = 'active' AND (username ILIKE $2 OR display_name ILIKE $2)
       ORDER BY display_name ASC
       LIMIT $3`,
      [currentUserId, `%${term}%`, limit]
    );
    return rows;
  },
};
