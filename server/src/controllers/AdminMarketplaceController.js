import { AdminMarketplaceService } from '../services/AdminMarketplaceService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminMarketplaceController = {
  list: asyncHandler(async (req, res) => {
    const data = await AdminMarketplaceService.list(req.query);
    res.json({ data });
  }),

  detail: asyncHandler(async (req, res) => {
    const data = await AdminMarketplaceService.detail(req.params.id);
    res.json({ data });
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await AdminMarketplaceService.removeListing(req.user.id, req.params.id, req.body.reason);
    res.json({ data });
  }),

  forceComplete: asyncHandler(async (req, res) => {
    const data = await AdminMarketplaceService.forceComplete(req.user.id, req.params.id, req.body.buyerId);
    res.json({ data });
  }),

  statistics: asyncHandler(async (req, res) => {
    const data = await AdminMarketplaceService.statistics();
    res.json({ data });
  }),
};
