import { query } from '../config/database.js';

export const UserModel = {
  async findByEmailOrUsername(identifier) {
    const { rows } = await query(
      `SELECT id, username, email, password_hash AS "passwordHash", role, status
       FROM users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [identifier]
    );

    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT id, username, email, role, status
       FROM users
       WHERE id = $1`,
      [id]
    );

    return rows[0] || null;
  },

  async existsByEmailOrUsername(email, username) {
    const { rows } = await query(
      `SELECT 1 FROM users
       WHERE email = $1 OR username = $2
       LIMIT 1`,
      [email, username]
    );

    return rows.length > 0;
  },

  async create({ username, email, passwordHash, displayName }) {
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role`,
      [username, email, passwordHash, displayName]
    );

    const user = rows[0];

    if (!user) {
      throw new Error('User creation failed (no row returned)');
    }

    await query(
      `INSERT INTO player_stats (user_id) VALUES ($1)`,
      [user.id]
    );

    return user;
  },

  async touchLastSeen(id) {
    await query(
      `UPDATE users SET last_seen_at = now() WHERE id = $1`,
      [id]
    );
  },
};
