import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { errors } from '../utils/AppError.js';

export const MatchController = {
  getById: asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT m.id, m.status, m.is_ranked AS "isRanked", m.winner_id AS "winnerId",
              m.started_at AS "startedAt", m.ended_at AS "endedAt", gm.code AS "mode"
       FROM matches m JOIN game_modes gm ON gm.id = m.mode_id
       WHERE m.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw errors.notFound('بازی یافت نشد');
    res.json({ data: rows[0] });
  }),

  myHistory: asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT m.id, m.status, m.is_ranked AS "isRanked", m.winner_id AS "winnerId",
              m.ended_at AS "endedAt", gm.code AS "mode"
       FROM match_participants mp
       JOIN matches m ON m.id = mp.match_id
       JOIN game_modes gm ON gm.id = m.mode_id
       WHERE mp.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json({ data: rows });
  }),
};
