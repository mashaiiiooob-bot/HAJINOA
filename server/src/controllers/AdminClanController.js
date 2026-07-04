import { AdminClanService } from '../services/AdminClanService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminClanController = {
  list: asyncHandler(async (req, res) => {
    const data = await AdminClanService.list(req.query);
    res.json({ data });
  }),

  detail: asyncHandler(async (req, res) => {
    const data = await AdminClanService.detail(req.params.id);
    res.json({ data });
  }),

  update: asyncHandler(async (req, res) => {
    const data = await AdminClanService.update(req.user.id, req.params.id, req.body);
    res.json({ data });
  }),

  transferOwnership: asyncHandler(async (req, res) => {
    const data = await AdminClanService.transferOwnership(req.user.id, req.params.id, req.body.userId);
    res.json({ data });
  }),

  kick: asyncHandler(async (req, res) => {
    const data = await AdminClanService.kickMember(req.user.id, req.params.id, req.body.userId);
    res.json({ data });
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await AdminClanService.remove(req.user.id, req.params.id);
    res.json({ data });
  }),
};
