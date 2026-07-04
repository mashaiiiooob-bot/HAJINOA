import { AdminGameModel } from '../models/AdminGameModel.js';
import { MatchService } from '../services/MatchService.js';
import { TournamentModel } from '../models/TournamentModel.js';
import { TournamentService } from '../services/TournamentService.js';
import { AdminLogService } from './AdminLogService.js';
import { notifyRoom } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

export const AdminGameService = {
  async listActive() {
    return AdminGameModel.listActive();
  },

  async history(filters) {
    const { rows, ...meta } = await AdminGameModel.history(filters);
    return { matches: rows, ...meta };
  },

  async detail(matchId) {
    const match = await AdminGameModel.getById(matchId);
    if (!match) throw errors.notFound('بازی یافت نشد');
    return match;
  },

  /** endMatch() — closes an active match with no winner declared (a "no contest" end). */
  async endMatch(adminId, matchId) {
    const ended = await AdminGameModel.endWithoutWinner(matchId);
    if (!ended) throw errors.conflict('این بازی در حال اجرا نیست');
    notifyRoom(`match:${matchId}`, 'match:finished', { winnerId: null, forcedByAdmin: true });
    await AdminLogService.log('match', 'match.end', { actorId: adminId, metadata: { matchId } });
    return { ended: true };
  },

  /** cancelMatch() — voids a match entirely (marks it aborted), no economy impact. */
  async cancelMatch(adminId, matchId) {
    const cancelled = await AdminGameModel.cancel(matchId);
    if (!cancelled) throw errors.conflict('این بازی قابل لغو نیست');
    notifyRoom(`match:${matchId}`, 'match:cancelled', { matchId, forcedByAdmin: true });
    await AdminLogService.log('match', 'match.cancel', { actorId: adminId, metadata: { matchId } });
    return { cancelled: true };
  },

  /**
   * forceWinner() — reuses MatchService.finishMatch() exactly (same coin/xp/rank-point logic
   * regular wins use, with streak bonus zeroed out to avoid an admin override inflating a streak),
   * and — if this match belongs to a tournament bracket — also reuses
   * TournamentService.recordMatchResult() so the bracket advances correctly.
   */
  async forceWinner(adminId, matchId, winnerId) {
    const match = await AdminGameModel.getById(matchId);
    if (!match) throw errors.notFound('بازی یافت نشد');
    if (match.status !== 'active') throw errors.conflict('این بازی در حال اجرا نیست');

    const players = match.players.map((p) => p.userId);
    if (!players.includes(winnerId)) throw errors.validation('این کاربر در این بازی حضور ندارد');
    const loserId = players.find((id) => id !== winnerId);

    const { coinGain, xpGain } = await MatchService.finishMatch({
      matchId,
      winnerId,
      loserId,
      isRanked: match.isRanked,
      winnerStreak: 0,
    });

    notifyRoom(`match:${matchId}`, 'match:finished', { winnerId, coinGain, xpGain, forcedByAdmin: true });

    const tournamentMatch = await TournamentModel.findByMatchId(matchId);
    if (tournamentMatch) {
      await TournamentService.recordMatchResult({ matchId, winnerId, loserId });
    }

    await AdminLogService.log('match', 'match.force_winner', {
      actorId: adminId,
      targetId: winnerId,
      metadata: { matchId, loserId },
    });
    return { winnerId, coinGain, xpGain };
  },
};
