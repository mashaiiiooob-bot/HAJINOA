import { AdminDashboardService } from '../services/AdminDashboardService.js';
import { AdminLogService } from '../services/AdminLogService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminDashboardController = {
  overview: asyncHandler(async (req, res) => {
    const data = await AdminDashboardService.overview();
    res.json({ data });
  }),

  charts: asyncHandler(async (req, res) => {
    const data = await AdminDashboardService.charts(req.query.days);
    res.json({ data });
  }),

  logs: asyncHandler(async (req, res) => {
    const { category, actorId, targetId, page, pageSize } = req.query;
    const data = await AdminLogService.list({ category, actorId, targetId }, page, pageSize);
    res.json({ data });
  }),
};
