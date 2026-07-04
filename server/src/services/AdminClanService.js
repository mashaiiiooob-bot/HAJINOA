import { AdminClanModel } from '../models/AdminClanModel.js';
import { ClanService } from '../services/ClanService.js';
import { AdminLogService } from './AdminLogService.js';
import { notifyRoom, notifyUser } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

export const AdminClanService = {
  async list({ search, page, pageSize }) {
    const { rows, ...meta } = await AdminClanModel.listAll({ search: search?.trim() || null, page, pageSize });
    return { clans: rows, ...meta };
  },

  /** detail() — reuses ClanService.getClan() so admins see the exact same shape (members + statistics) as players. */
  async detail(clanId) {
    return ClanService.getClan(clanId);
  },

  async update(adminId, clanId, patch) {
    const updated = await AdminClanModel.update(clanId, patch);
    if (!updated) throw errors.notFound('کلن یافت نشد یا داده‌ای برای بروزرسانی ارسال نشده');
    notifyRoom(`clan:${clanId}`, 'clan:announcement:updated', { clanId }); // cheap signal for clients to refetch
    await AdminLogService.log('clan', 'clan.update', { actorId: adminId, metadata: { clanId, patch } });
    return updated;
  },

  async transferOwnership(adminId, clanId, newOwnerId) {
    const clan = await AdminClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    const isMember = await AdminClanModel.memberExists(clanId, newOwnerId);
    if (!isMember) throw errors.validation('کاربر مورد نظر عضو این کلن نیست');

    await AdminClanModel.setOwner(clanId, newOwnerId);
    notifyRoom(`clan:${clanId}`, 'clan:ownership:transferred', { clanId, newOwnerId });
    await AdminLogService.log('clan', 'clan.transfer_ownership', { actorId: adminId, targetId: newOwnerId, metadata: { clanId } });
    return { newOwnerId };
  },

  async kickMember(adminId, clanId, userId) {
    const removed = await AdminClanModel.removeMember(clanId, userId);
    if (!removed) throw errors.notFound('این کاربر عضو کلن نیست');
    notifyUser(userId, 'admin:notice', { type: 'clan_kicked', clanId });
    notifyRoom(`clan:${clanId}`, 'clan:member:kicked', { clanId, userId });
    await AdminLogService.log('clan', 'clan.kick_member', { actorId: adminId, targetId: userId, metadata: { clanId } });
    return { kicked: true };
  },

  async remove(adminId, clanId) {
    notifyRoom(`clan:${clanId}`, 'clan:deleted', { clanId });
    const removed = await AdminClanModel.remove(clanId);
    if (!removed) throw errors.notFound('کلن یافت نشد');
    await AdminLogService.log('clan', 'clan.delete', { actorId: adminId, metadata: { clanId } });
    return { deleted: true };
  },
};
