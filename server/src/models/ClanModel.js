import { query } from '../config/database.js';

const MAX_MEMBERS = 30;

const CLAN_FIELDS = `
  c.id, c.name, c.tag, c.description, c.avatar_url AS "avatarUrl", c.owner_id AS "ownerId",
  c.trophies, c.level, c.xp, c.announcement, c.announcement_set_at AS "announcementSetAt",
  c.created_at AS "createdAt"
`;

export const ClanModel = {
  MAX_MEMBERS,

  async create({ name, tag, description, avatarUrl, ownerId }) {
    const { rows } = await query(
      `INSERT INTO clans (name, tag, description, avatar_url, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CLAN_FIELDS}`,
      [name, tag, description || null, avatarUrl || null, ownerId]
    );
    const clan = rows[0];
    await query(`INSERT INTO clan_members (clan_id, user_id, role) VALUES ($1, $2, 'leader')`, [clan.id, ownerId]);
    return clan;
  },

  async findById(clanId) {
    const { rows } = await query(`SELECT ${CLAN_FIELDS} FROM clans c WHERE c.id = $1`, [clanId]);
    return rows[0] || null;
  },

  async nameOrTagTaken(name, tag) {
    const { rows } = await query(`SELECT 1 FROM clans WHERE name = $1 OR tag = $2 LIMIT 1`, [name, tag]);
    return rows.length > 0;
  },

  async currentClanForUser(userId) {
    const { rows } = await query(
      `SELECT cm.clan_id AS "clanId", cm.role, ${CLAN_FIELDS}
       FROM clan_members cm JOIN clans c ON c.id = cm.clan_id
       WHERE cm.user_id = $1`,
      [userId]
    );
    return rows[0] || null;
  },

  async memberCount(clanId) {
    const { rows } = await query(`SELECT COUNT(*)::int AS count FROM clan_members WHERE clan_id = $1`, [clanId]);
    return rows[0].count;
  },

  async addMember(clanId, userId, role = 'member') {
    await query(`INSERT INTO clan_members (clan_id, user_id, role) VALUES ($1, $2, $3)`, [clanId, userId, role]);
  },

  async removeMember(clanId, userId) {
    const { rowCount } = await query(`DELETE FROM clan_members WHERE clan_id = $1 AND user_id = $2`, [
      clanId,
      userId,
    ]);
    return rowCount > 0;
  },

  async getMembership(clanId, userId) {
    const { rows } = await query(
      `SELECT role, joined_at AS "joinedAt" FROM clan_members WHERE clan_id = $1 AND user_id = $2`,
      [clanId, userId]
    );
    return rows[0] || null;
  },

  async listMembers(clanId) {
    const { rows } = await query(
      `SELECT cm.user_id AS "userId", cm.role, cm.joined_at AS "joinedAt",
              u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.level,
              ps.rank_points AS "rankPoints", ps.games_won AS "gamesWon", ps.games_played AS "gamesPlayed"
       FROM clan_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
       WHERE cm.clan_id = $1
       ORDER BY (cm.role = 'leader') DESC, ps.rank_points DESC NULLS LAST`,
      [clanId]
    );
    return rows;
  },

  async setOwner(clanId, newOwnerId) {
    await query(`UPDATE clans SET owner_id = $2 WHERE id = $1`, [clanId, newOwnerId]);
  },

  async setRole(clanId, userId, role) {
    await query(`UPDATE clan_members SET role = $3 WHERE clan_id = $1 AND user_id = $2`, [clanId, userId, role]);
  },

  async addXp(clanId, amount) {
    // level formula: level = floor(xp / 500) + 1
    await query(`UPDATE clans SET xp = xp + $2, level = FLOOR((xp + $2) / 500) + 1 WHERE id = $1`, [clanId, amount]);
  },

  async setAnnouncement(clanId, setBy, announcement) {
    const { rows } = await query(
      `UPDATE clans SET announcement = $2, announcement_set_by = $3, announcement_set_at = now()
       WHERE id = $1
       RETURNING announcement, announcement_set_at AS "announcementSetAt"`,
      [clanId, announcement, setBy]
    );
    return rows[0];
  },

  async browse({ search, limit, offset }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.tag ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${CLAN_FIELDS}, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS "memberCount",
              COUNT(*) OVER() AS "totalCount"
       FROM clans c
       ${where}
       ORDER BY c.trophies DESC, c.level DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return { rows: rows.map(({ totalCount, ...r }) => r), total };
  },

  /** Clan leaderboard: ranked by trophies, with aggregate member stats. */
  async leaderboard(limit = 25) {
    const { rows } = await query(
      `SELECT ${CLAN_FIELDS}, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS "memberCount",
              COALESCE(SUM(ps.games_won), 0)::int AS "totalWins",
              COALESCE(SUM(ps.games_played), 0)::int AS "totalGames"
       FROM clans c
       LEFT JOIN clan_members cm ON cm.clan_id = c.id
       LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
       GROUP BY c.id
       ORDER BY c.trophies DESC, c.level DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  },

  async statistics(clanId) {
    const { rows } = await query(
      `SELECT (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = $1)::int AS "memberCount",
              COALESCE(SUM(ps.games_won), 0)::int AS "totalWins",
              COALESCE(SUM(ps.games_played), 0)::int AS "totalGames",
              COALESCE(SUM(ps.rank_points), 0)::int AS "totalRankPoints",
              COALESCE(ROUND(AVG(ps.rank_points)), 0)::int AS "avgRankPoints"
       FROM clan_members cm
       LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
       WHERE cm.clan_id = $1`,
      [clanId]
    );
    return rows[0];
  },

  async deleteClan(clanId) {
    await query(`DELETE FROM clans WHERE id = $1`, [clanId]);
  },
};
