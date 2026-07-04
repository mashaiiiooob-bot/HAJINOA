import { AnnouncementService } from '../services/AnnouncementService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminAnnouncementController = {
  list: asyncHandler(async (req, res) => {
    const data = await AnnouncementService.list(req.query.page, req.query.pageSize);
    res.json({ data });
  }),

  send: asyncHandler(async (req, res) => {
    const data = await AnnouncementService.send(req.user.id, req.body);
    res.status(201).json({ data });
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await AnnouncementService.remove(req.user.id, req.params.id);
    res.json({ data });
  }),
};
