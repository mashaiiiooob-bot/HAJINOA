import { query } from '../config/database.js';

const TOURNAMENT_FIELDS = `
  t.id, t.name, t.prize_coins AS "prizeCoins", t.max_players AS "maxPlayers",
  t.status, t.current_round AS "currentRound", t.starts_at AS "startsAt", t.ends_at AS "endsAt",
  t.champion_id AS "championId", t.runner_up_id AS "runnerUpId", t.created_at AS "createdAt"
`;

export const AdminTournamentModel = {
  async listAll({ search, status, page, pageSize }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`t.name ILIKE $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${TOURNAMENT_FIELDS},
              (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS "participantCount",
              COUNT(*) OVER() AS "totalCount"
       FROM tournaments t
       ${where}
       ORDER BY t.created_at DESC
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

  async statistics(tournamentId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS "participantCount",
              COALESCE(SUM(coins_awarded), 0)::bigint AS "coinsAwarded",
              COALESCE(SUM(xp_awarded), 0)::int AS "xpAwarded",
              COALESCE(SUM(rank_points_awarded), 0)::int AS "rankPointsAwarded"
       FROM tournament_participants WHERE tournament_id = $1`,
      [tournamentId]
    );
    return rows[0];
  },

  async cancel(tournamentId) {
    const { rows } = await query(
      `UPDATE tournaments SET status = 'cancelled', ends_at = now()
       WHERE id = $1 AND status IN ('registration', 'active')
       RETURNING ${TOURNAMENT_FIELDS}`,
      [tournamentId]
    );
    return rows[0] || null;
  },

  async remove(tournamentId) {
    const { rowCount } = await query(`DELETE FROM tournaments WHERE id = $1 AND status <> 'active'`, [tournamentId]);
    return rowCount > 0;
  },

  async findStatus(tournamentId) {
    const { rows } = await query(`SELECT status FROM tournaments WHERE id = $1`, [tournamentId]);
    return rows[0]?.status || null;
  },
};
