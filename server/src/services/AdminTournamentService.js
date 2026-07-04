import { AdminTournamentModel } from '../models/AdminTournamentModel.js';
import { TournamentService } from '../services/TournamentService.js';
import { AdminLogService } from './AdminLogService.js';
import { notifyRoom } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

export const AdminTournamentService = {
  async list({ search, status, page, pageSize }) {
    const { rows, ...meta } = await AdminTournamentModel.listAll({ search: search?.trim() || null, status, page, pageSize });
    return { tournaments: rows, ...meta };
  },

  /** View details — reuses TournamentService.getById() so admins see exactly the same bracket/participant shape as players. */
  async detail(tournamentId) {
    const [tournament, statistics] = await Promise.all([
      TournamentService.getById(tournamentId),
      AdminTournamentModel.statistics(tournamentId),
    ]);
    return { ...tournament, adminStatistics: statistics };
  },

  /**
   * forceStart() — reuses TournamentService.startTournament() as-is. That function requires
   * exactly 8 registered players because the bracket-pairing algorithm assumes it; this is a
   * manual trigger for a tournament that's already full but didn't auto-start, not a way to
   * start an under-filled bracket (which would break round pairing).
   */
  async forceStart(adminId, tournamentId) {
    const status = await AdminTournamentModel.findStatus(tournamentId);
    if (!status) throw errors.notFound('مسابقه یافت نشد');
    if (status !== 'registration') throw errors.conflict('این مسابقه در وضعیت انتظار نیست');

    const result = await TournamentService.startTournament(tournamentId);
    await AdminLogService.log('admin_action', 'tournament.force_start', { actorId: adminId, metadata: { tournamentId } });
    return result;
  },

  /** forceEnd() — finalizes a tournament whose final match already has a winner (reuses reward logic exactly). */
  async forceEnd(adminId, tournamentId) {
    const status = await AdminTournamentModel.findStatus(tournamentId);
    if (!status) throw errors.notFound('مسابقه یافت نشد');
    if (status !== 'active') throw errors.conflict('این مسابقه در حال اجرا نیست');

    const result = await TournamentService.finishTournament(tournamentId);
    await AdminLogService.log('admin_action', 'tournament.force_end', { actorId: adminId, metadata: { tournamentId } });
    return result;
  },

  /** cancel() — voids a tournament that hasn't finished; no rewards were paid, so nothing to reverse. */
  async cancel(adminId, tournamentId, reason) {
    const cancelled = await AdminTournamentModel.cancel(tournamentId);
    if (!cancelled) throw errors.conflict('این مسابقه قابل لغو نیست (ممکن است قبلاً پایان یافته یا لغو شده باشد)');
    notifyRoom(`tournament:${tournamentId}`, 'tournament:cancelled', { tournamentId, reason: reason || null });
    await AdminLogService.log('admin_action', 'tournament.cancel', {
      actorId: adminId,
      metadata: { tournamentId, reason },
    });
    return cancelled;
  },

  async remove(adminId, tournamentId) {
    const removed = await AdminTournamentModel.remove(tournamentId);
    if (!removed) throw errors.conflict('مسابقه فعال را نمی‌توان حذف کرد؛ ابتدا آن را لغو کنید');
    await AdminLogService.log('admin_action', 'tournament.delete', { actorId: adminId, metadata: { tournamentId } });
    return { deleted: true };
  },
};
