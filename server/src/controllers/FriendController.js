import { FriendService } from '../services/FriendService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const FriendController = {
  list: asyncHandler(async (req, res) => {
    const friends = await FriendService.listFriends(req.user.id);
    res.json({ data: friends });
  }),

  requests: asyncHandler(async (req, res) => {
    const result = await FriendService.listRequests(req.user.id);
    res.json({ data: result });
  }),

  search: asyncHandler(async (req, res) => {
    const results = await FriendService.search(req.user.id, req.query.q);
    res.json({ data: results });
  }),

  profile: asyncHandler(async (req, res) => {
    const profile = await FriendService.friendProfile(req.user.id, req.params.id);
    res.json({ data: profile });
  }),

  send: asyncHandler(async (req, res) => {
    const request = await FriendService.sendFriendRequest(req.user.id, req.body.addresseeId);
    res.status(201).json({ data: request });
  }),

  accept: asyncHandler(async (req, res) => {
    const result = await FriendService.acceptFriendRequest(req.user.id, req.params.id);
    res.json({ data: result });
  }),

  reject: asyncHandler(async (req, res) => {
    const result = await FriendService.rejectFriendRequest(req.user.id, req.params.id);
    res.json({ data: result });
  }),

  cancel: asyncHandler(async (req, res) => {
    const result = await FriendService.cancelFriendRequest(req.user.id, req.params.id);
    res.json({ data: result });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await FriendService.removeFriend(req.user.id, req.params.id);
    res.json({ data: result });
  }),
};
