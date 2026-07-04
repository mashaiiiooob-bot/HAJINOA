import { AdminUserModel } from '../models/AdminUserModel.js';
import { AdminLogService } from './AdminLogService.js';
import { notifyUser, forceDisconnectUser } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

const DEFAULT_RESET_COINS = 1000;
const MAX_RESET_COINS = 1_000_000_000;

export const AdminUserService = {
  async search({ search, role, status, sort, page = 1, pageSize = 20 }) {
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const { rows, total } = await AdminUserModel.search({
      search: search?.trim() || null,
      role: role || null,
      status: status || null,
      sort,
      limit,
      offset,
    });
    return {
      users: rows,
      page: Math.max(Number(page) || 1, 1),
      pageSize: limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  },

  async profile(userId) {
    const profile = await AdminUserModel.profileDetail(userId);
    if (!profile) throw errors.notFound('کاربر یافت نشد');
    return profile;
  },

  async ban(adminId, userId, reason) {
    const target = await AdminUserModel.findById(userId);
    if (!target) throw errors.notFound('کاربر یافت نشد');
    if (target.role === 'admin') throw errors.forbidden('نمی‌توانید یک مدیر را مسدود کنید');

    const updated = await AdminUserModel.setStatus(userId, 'banned');
    await forceDisconnectUser(userId, 'banned');
    await AdminLogService.log('admin_action', 'user.ban', { actorId: adminId, targetId: userId, metadata: { reason } });
    return updated;
  },

  async unban(adminId, userId) {
    const updated = await AdminUserModel.setStatus(userId, 'active');
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    await AdminLogService.log('admin_action', 'user.unban', { actorId: adminId, targetId: userId });
    return updated;
  },

  async mute(adminId, userId, minutes) {
    const target = await AdminUserModel.findById(userId);
    if (!target) throw errors.notFound('کاربر یافت نشد');

    const mutedUntil = new Date(Date.now() + minutes * 60_000);
    const updated = await AdminUserModel.setMute(userId, mutedUntil);
    notifyUser(userId, 'admin:notice', { type: 'muted', until: mutedUntil });
    await AdminLogService.log('admin_action', 'user.mute', {
      actorId: adminId,
      targetId: userId,
      metadata: { minutes, mutedUntil },
    });
    return updated;
  },

  async unmute(adminId, userId) {
    const updated = await AdminUserModel.setMute(userId, null);
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    notifyUser(userId, 'admin:notice', { type: 'unmuted' });
    await AdminLogService.log('admin_action', 'user.unmute', { actorId: adminId, targetId: userId });
    return updated;
  },

  async setRole(adminId, userId, role) {
    if (adminId === userId) throw errors.validation('نمی‌توانید نقش خودتان را تغییر دهید');
    const updated = await AdminUserModel.setRole(userId, role);
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    notifyUser(userId, 'admin:notice', { type: 'role_changed', role });
    await AdminLogService.log('admin_action', 'user.role.set', { actorId: adminId, targetId: userId, metadata: { role } });
    return updated;
  },

  async resetCoins(adminId, userId, amount = DEFAULT_RESET_COINS) {
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_RESET_COINS) {
      throw errors.validation('مقدار سکه نامعتبر است');
    }
    const updated = await AdminUserModel.resetCoins(userId, amount);
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    await AdminLogService.log('economy', 'user.coins.reset', { actorId: adminId, targetId: userId, metadata: { amount } });
    return updated;
  },

  async resetXp(adminId, userId) {
    const updated = await AdminUserModel.resetXp(userId);
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    await AdminLogService.log('economy', 'user.xp.reset', { actorId: adminId, targetId: userId });
    return updated;
  },

  async resetInventory(adminId, userId) {
    const removedCount = await AdminUserModel.resetInventory(userId);
    await AdminLogService.log('economy', 'user.inventory.reset', {
      actorId: adminId,
      targetId: userId,
      metadata: { removedCount },
    });
    return { removedCount };
  },

  async resetStatistics(adminId, userId) {
    const updated = await AdminUserModel.resetStatistics(userId);
    if (!updated) throw errors.notFound('کاربر یافت نشد');
    await AdminLogService.log('economy', 'user.stats.reset', { actorId: adminId, targetId: userId });
    return updated;
  },
};
