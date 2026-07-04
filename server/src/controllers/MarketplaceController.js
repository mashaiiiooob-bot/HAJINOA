import { MarketplaceService } from '../services/MarketplaceService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const MarketplaceController = {
  browse: asyncHandler(async (req, res) => {
    const result = await MarketplaceService.browse(req.query);
    res.json({ data: result });
  }),

  inventory: asyncHandler(async (req, res) => {
    const items = await MarketplaceService.getInventory(req.user.id);
    res.json({ data: items });
  }),

  listItem: asyncHandler(async (req, res) => {
    const listing = await MarketplaceService.listItem(req.user.id, req.body);
    res.status(201).json({ data: listing });
  }),

  buyItem: asyncHandler(async (req, res) => {
    const result = await MarketplaceService.buyItem(req.user.id, req.params.id);
    res.json({ data: result });
  }),

  removeListing: asyncHandler(async (req, res) => {
    await MarketplaceService.removeListing(req.user.id, req.params.id);
    res.status(204).send();
  }),

  myHistory: asyncHandler(async (req, res) => {
    const rows = await MarketplaceService.myHistory(req.user.id, req.query.page, req.query.pageSize);
    res.json({ data: rows });
  }),
};
