import { AdminGameService } from '../services/AdminGameService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminGameController = {
  listActive: asyncHandler(async (req, res) => {
    const data = await AdminGameService.listActive();
    res.json({ data });
  }),

  history: asyncHandler(async (req, res) => {
    const data = await AdminGameService.history(req.query);
    res.json({ data });
  }),

  detail: asyncHandler(async (req, res) => {
    const data = await AdminGameService.detail(req.params.id);
    res.json({ data });
  }),

  end: asyncHandler(async (req, res) => {
    const data = await AdminGameService.endMatch(req.user.id, req.params.id);
    res.json({ data });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await AdminGameService.cancelMatch(req.user.id, req.params.id);
    res.json({ data });
  }),

  forceWinner: asyncHandler(async (req, res) => {
    const data = await AdminGameService.forceWinner(req.user.id, req.params.id, req.body.winnerId);
    res.json({ data });
  }),
};
