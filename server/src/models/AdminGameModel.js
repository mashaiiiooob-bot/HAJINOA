import { query } from '../config/database.js';

const MATCH_FIELDS = `
  m.id, m.status, m.is_ranked AS "isRanked", m.winner_id AS "winnerId",
  m.started_at AS "startedAt", m.ended_at AS "endedAt", m.created_at AS "createdAt",
  gm.code AS "modeCode", gm.name_fa AS "modeName"
`;

export const AdminGameModel = {
  async listActive() {
    const { rows } = await query(
      `SELECT ${MATCH_FIELDS},
              json_agg(json_build_object('userId', u.id, 'displayName', u.display_name) ORDER BY mp.team) AS players
       FROM matches m
       JOIN game_modes gm ON gm.id = m.mode_id
       JOIN match_participants mp ON mp.match_id = m.id
       JOIN users u ON u.id = mp.user_id
       WHERE m.status = 'active'
       GROUP BY m.id, gm.code, gm.name_fa
       ORDER BY m.started_at DESC`
    );
    return rows;
  },

  async history({ search, status, page, pageSize }) {
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`m.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`EXISTS (
        SELECT 1 FROM match_participants mp2 JOIN users u2 ON u2.id = mp2.user_id
        WHERE mp2.match_id = m.id AND u2.username ILIKE $${params.length}
      )`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${MATCH_FIELDS},
              json_agg(json_build_object('userId', u.id, 'displayName', u.display_name) ORDER BY mp.team) AS players,
              COUNT(*) OVER() AS "totalCount"
       FROM matches m
       JOIN game_modes gm ON gm.id = m.mode_id
       JOIN match_participants mp ON mp.match_id = m.id
       JOIN users u ON u.id = mp.user_id
       ${where}
       GROUP BY m.id, gm.code, gm.name_fa
       ORDER BY m.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return {
      rows: rows.map(({ totalCount, ...r }) => r),
      total,
      page: Math.max(Number(page) || 1, 1),
      pageSize: limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  },

  async getById(matchId) {
    const { rows } = await query(
      `SELECT ${MATCH_FIELDS},
              json_agg(json_build_object('userId', u.id, 'displayName', u.display_name) ORDER BY mp.team) AS players
       FROM matches m
       JOIN game_modes gm ON gm.id = m.mode_id
       JOIN match_participants mp ON mp.match_id = m.id
       JOIN users u ON u.id = mp.user_id
       WHERE m.id = $1
       GROUP BY m.id, gm.code, gm.name_fa`,
      [matchId]
    );
    return rows[0] || null;
  },

  async endWithoutWinner(matchId) {
    const { rows } = await query(
      `UPDATE matches SET status = 'completed', ended_at = now() WHERE id = $1 AND status = 'active' RETURNING id`,
      [matchId]
    );
    return rows[0] || null;
  },

  async cancel(matchId) {
    const { rows } = await query(
      `UPDATE matches SET status = 'aborted', ended_at = now() WHERE id = $1 AND status IN ('pending', 'active') RETURNING id`,
      [matchId]
    );
    return rows[0] || null;
  },
};
