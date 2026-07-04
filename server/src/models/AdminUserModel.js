import { query, withTransaction } from '../config/database.js';

const ADMIN_USER_FIELDS = `
  id, username, email, display_name AS "displayName", avatar_url AS "avatarUrl",
  role, level, xp, coins, gems, status, muted_until AS "mutedUntil",
  last_seen_at AS "lastSeenAt", created_at AS "createdAt"
`;

export const AdminUserModel = {
  async search({ search, role, status, sort, limit, offset }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length} OR display_name ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumns = {
      newest: 'created_at DESC',
      oldest: 'created_at ASC',
      coins_desc: 'coins DESC',
      level_desc: 'level DESC',
      last_seen: 'last_seen_at DESC',
    };
    const orderBy = sortColumns[sort] || sortColumns.newest;

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${ADMIN_USER_FIELDS}, COUNT(*) OVER() AS "totalCount"
       FROM users
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return { rows: rows.map(({ totalCount, ...r }) => r), total };
  },

  async findById(id) {
    const { rows } = await query(`SELECT ${ADMIN_USER_FIELDS} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async profileDetail(id) {
    const [{ rows: userRows }, { rows: statsRows }, { rows: clanRows }, { rows: invRows }] = await Promise.all([
      query(`SELECT ${ADMIN_USER_FIELDS} FROM users WHERE id = $1`, [id]),
      query(
        `SELECT games_played AS "gamesPlayed", games_won AS "gamesWon", games_lost AS "gamesLost",
                games_drawn AS "gamesDrawn", win_streak AS "winStreak", best_win_streak AS "bestWinStreak",
                rank_points AS "rankPoints"
         FROM player_stats WHERE user_id = $1`,
        [id]
      ),
      query(
        `SELECT c.id, c.name, c.tag, cm.role FROM clan_members cm JOIN clans c ON c.id = cm.clan_id WHERE cm.user_id = $1`,
        [id]
      ),
      query(`SELECT COUNT(*)::int AS count FROM user_inventory WHERE user_id = $1`, [id]),
    ]);

    if (!userRows[0]) return null;
    return {
      ...userRows[0],
      stats: statsRows[0] || null,
      clan: clanRows[0] || null,
      inventoryCount: invRows[0].count,
    };
  },

  async isMuted(id) {
    const { rows } = await query(`SELECT muted_until AS "mutedUntil" FROM users WHERE id = $1`, [id]);
    return !!(rows[0]?.mutedUntil && new Date(rows[0].mutedUntil) > new Date());
  },

  async setStatus(id, status) {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${ADMIN_USER_FIELDS}`,
        [id, status]
      );
      if (status === 'banned') {
        await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      }
      return rows[0] || null;
    });
  },

  async setMute(id, mutedUntil) {
    const { rows } = await query(
      `UPDATE users SET muted_until = $2, updated_at = now() WHERE id = $1 RETURNING ${ADMIN_USER_FIELDS}`,
      [id, mutedUntil]
    );
    return rows[0] || null;
  },

  async setRole(id, role) {
    const { rows } = await query(
      `UPDATE users SET role = $2, updated_at = now() WHERE id = $1 RETURNING ${ADMIN_USER_FIELDS}`,
      [id, role]
    );
    return rows[0] || null;
  },

  async resetCoins(id, amount) {
    const { rows } = await query(`UPDATE users SET coins = $2, updated_at = now() WHERE id = $1 RETURNING coins`, [
      id,
      amount,
    ]);
    return rows[0] || null;
  },

  async resetXp(id) {
    const { rows } = await query(
      `UPDATE users SET xp = 0, level = 1, updated_at = now() WHERE id = $1 RETURNING xp, level`,
      [id]
    );
    return rows[0] || null;
  },

  async resetInventory(id) {
    const { rowCount } = await query(`DELETE FROM user_inventory WHERE user_id = $1`, [id]);
    return rowCount;
  },

  async resetStatistics(id) {
    const { rows } = await query(
      `UPDATE player_stats
       SET games_played = 0, games_won = 0, games_lost = 0, games_drawn = 0,
           win_streak = 0, best_win_streak = 0, rank_points = 1000, updated_at = now()
       WHERE user_id = $1
       RETURNING rank_points AS "rankPoints"`,
      [id]
    );
    return rows[0] || null;
  },
};
