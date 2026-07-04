import { UserModel } from '../models/UserModel.js';
import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { errors } from '../utils/AppError.js';

export const UserController = {
  me: asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user.id);
    if (!user) throw errors.notFound('کاربر یافت نشد');

    const { rows } = await query(
      `SELECT games_played AS "gamesPlayed", games_won AS "gamesWon", games_lost AS "gamesLost",
              win_streak AS "winStreak", rank_points AS "rankPoints"
       FROM player_stats WHERE user_id = $1`,
      [user.id]
    );
    res.json({ data: { ...user, stats: rows[0] || null } });
  }),

  getById: asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.params.id);
    if (!user) throw errors.notFound('کاربر یافت نشد');
    res.json({ data: user });
  }),

  leaderboard: asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await UserModel.leaderboard(limit, offset);
    res.json({ data: rows });
  }),
};
