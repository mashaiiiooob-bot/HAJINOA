import { NotificationService } from '../services/NotificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const NotificationController = {
  list: asyncHandler(async (req, res) => {
    const result = await NotificationService.list(req.user.id, req.query.page, req.query.pageSize);
    res.json({ data: result });
  }),

  markRead: asyncHandler(async (req, res) => {
    await NotificationService.markRead(req.user.id, req.params.id);
    res.status(204).send();
  }),

  markAllRead: asyncHandler(async (req, res) => {
    await NotificationService.markAllRead(req.user.id);
    res.status(204).send();
  }),
};
