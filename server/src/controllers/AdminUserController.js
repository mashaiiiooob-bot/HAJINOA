import { AdminUserService } from '../services/AdminUserService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const AdminUserController = {
  search: asyncHandler(async (req, res) => {
    const data = await AdminUserService.search(req.query);
    res.json({ data });
  }),

  profile: asyncHandler(async (req, res) => {
    const data = await AdminUserService.profile(req.params.id);
    res.json({ data });
  }),

  ban: asyncHandler(async (req, res) => {
    const data = await AdminUserService.ban(req.user.id, req.params.id, req.body.reason);
    res.json({ data });
  }),

  unban: asyncHandler(async (req, res) => {
    const data = await AdminUserService.unban(req.user.id, req.params.id);
    res.json({ data });
  }),

  mute: asyncHandler(async (req, res) => {
    const data = await AdminUserService.mute(req.user.id, req.params.id, req.body.minutes);
    res.json({ data });
  }),

  unmute: asyncHandler(async (req, res) => {
    const data = await AdminUserService.unmute(req.user.id, req.params.id);
    res.json({ data });
  }),

  setRole: asyncHandler(async (req, res) => {
    const data = await AdminUserService.setRole(req.user.id, req.params.id, req.body.role);
    res.json({ data });
  }),

  resetCoins: asyncHandler(async (req, res) => {
    const data = await AdminUserService.resetCoins(req.user.id, req.params.id, req.body.amount);
    res.json({ data });
  }),

  resetXp: asyncHandler(async (req, res) => {
    const data = await AdminUserService.resetXp(req.user.id, req.params.id);
    res.json({ data });
  }),

  resetInventory: asyncHandler(async (req, res) => {
    const data = await AdminUserService.resetInventory(req.user.id, req.params.id);
    res.json({ data });
  }),

  resetStatistics: asyncHandler(async (req, res) => {
    const data = await AdminUserService.resetStatistics(req.user.id, req.params.id);
    res.json({ data });
  }),
};
