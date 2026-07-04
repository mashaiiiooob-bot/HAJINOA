import { AdminTournamentService } from '../services/AdminTournamentService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminTournamentController = {
  list: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.list(req.query);
    res.json({ data });
  }),

  detail: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.detail(req.params.id);
    res.json({ data });
  }),

  forceStart: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.forceStart(req.user.id, req.params.id);
    res.json({ data });
  }),

  forceEnd: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.forceEnd(req.user.id, req.params.id);
    res.json({ data });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.cancel(req.user.id, req.params.id, req.body.reason);
    res.json({ data });
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await AdminTournamentService.remove(req.user.id, req.params.id);
    res.json({ data });
  }),
};
