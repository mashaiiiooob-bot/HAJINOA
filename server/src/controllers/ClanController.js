import { ClanService } from '../services/ClanService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const ClanController = {
  browse: asyncHandler(async (req, res) => {
    const result = await ClanService.browse(req.query);
    res.json({ data: result });
  }),

  leaderboard: asyncHandler(async (req, res) => {
    const rows = await ClanService.leaderboard();
    res.json({ data: rows });
  }),

  myClan: asyncHandler(async (req, res) => {
    const clan = await ClanService.myClan(req.user.id);
    res.json({ data: clan });
  }),

  getById: asyncHandler(async (req, res) => {
    const clan = await ClanService.getClan(req.params.id);
    res.json({ data: clan });
  }),

  create: asyncHandler(async (req, res) => {
    const clan = await ClanService.createClan(req.user.id, req.body);
    res.status(201).json({ data: clan });
  }),

  join: asyncHandler(async (req, res) => {
    const clan = await ClanService.joinClan(req.user.id, req.params.id);
    res.json({ data: clan });
  }),

  leave: asyncHandler(async (req, res) => {
    const result = await ClanService.leaveClan(req.user.id, req.params.id);
    res.json({ data: result });
  }),

  kick: asyncHandler(async (req, res) => {
    const result = await ClanService.kickMember(req.user.id, req.params.id, req.body.userId);
    res.json({ data: result });
  }),

  transferOwnership: asyncHandler(async (req, res) => {
    const result = await ClanService.transferOwnership(req.user.id, req.params.id, req.body.userId);
    res.json({ data: result });
  }),

  invite: asyncHandler(async (req, res) => {
    const result = await ClanService.inviteToClan(req.user.id, req.params.id, req.body.userId);
    res.json({ data: result });
  }),

  setAnnouncement: asyncHandler(async (req, res) => {
    const result = await ClanService.setAnnouncement(req.user.id, req.params.id, req.body.announcement);
    res.json({ data: result });
  }),

  chatHistory: asyncHandler(async (req, res) => {
    const rows = await ClanService.clanChatHistory(req.user.id, req.params.id, { limit: req.query.limit });
    res.json({ data: rows });
  }),
};
