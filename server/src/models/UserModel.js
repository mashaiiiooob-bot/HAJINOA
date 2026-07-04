import { query } from '../config/database.js';

const PUBLIC_FIELDS = `
  id, username, display_name AS "displayName", avatar_url AS "avatarUrl",
  role, level, xp, coins, gems, status, last_seen_at AS "lastSeenAt", created_at AS "createdAt"
`;

export const UserModel = {
  async findByEmailOrUsername(identifier) {
    const { rows } = await query(
      `SELECT id, username, email, password_hash AS "passwordHash", role, status
       FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
      [identifier]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async existsByEmailOrUsername(email, username) {
    const { rows } = await query(
      `SELECT 1 FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );
    return rows.length > 0;
  },

  async create({ username, email, passwordHash, displayName }) {
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_FIELDS}`,
      [username, email, passwordHash, displayName]
    );
    const user = rows[0];
    await query(`INSERT INTO player_stats (user_id) VALUES ($1)`, [user.id]);
    return user;
  },

  async touchLastSeen(id) {
    await query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [id]);
  },

  async updateEconomy(client, id, { coinsDelta = 0, xpDelta = 0 }) {
    const { rows } = await client.query(
      `UPDATE users SET coins = coins + $2, xp = xp + $3 WHERE id = $1
       RETURNING coins, xp, level`,
      [id, coinsDelta, xpDelta]
    );
    return rows[0];
  },

  async leaderboard(limit = 50, offset = 0) {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
              u.level, ps.rank_points AS "rankPoints", ps.games_won AS "gamesWon",
              ps.games_played AS "gamesPlayed"
       FROM player_stats ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.status = 'active'
       ORDER BY ps.rank_points DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },
};
