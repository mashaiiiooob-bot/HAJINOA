import { AdminSettingsService } from '../services/AdminSettingsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminSettingsController = {
  getAll: asyncHandler(async (req, res) => {
    const data = await AdminSettingsService.getAll();
    res.json({ data });
  }),

  update: asyncHandler(async (req, res) => {
    const data = await AdminSettingsService.update(req.user.id, req.params.category, req.body.settings);
    res.json({ data });
  }),
};
