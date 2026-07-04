import { AdminLogModel } from '../models/AdminLogModel.js';
import { logger } from '../utils/logger.js';

export const AdminLogService = {
  /** Never throws — a logging failure must never break the action being logged. */
  async log(category, action, { actorId, targetId, metadata } = {}) {
    try {
      return await AdminLogModel.create({ category, actorId, targetId, action, metadata });
    } catch (err) {
      logger.error({ err, category, action }, 'Failed to write admin log');
      return null;
    }
  },

  async list(filters, page = 1, pageSize = 40) {
    const limit = Math.min(Math.max(Number(pageSize) || 40, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const { rows, total } = await AdminLogModel.list({ ...filters, limit, offset });
    return { logs: rows, page: Math.max(Number(page) || 1, 1), pageSize: limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) };
  },
};
