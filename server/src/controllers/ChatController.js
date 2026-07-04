import { ChatService } from '../services/ChatService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const ChatController = {
  globalHistory: asyncHandler(async (req, res) => {
    const rows = await ChatService.globalHistory(req.query.limit);
    res.json({ data: rows });
  }),

  matchHistory: asyncHandler(async (req, res) => {
    const rows = await ChatService.matchHistory(req.params.matchId, req.query.limit);
    res.json({ data: rows });
  }),

  onlineUsers: asyncHandler(async (req, res) => {
    const rows = await ChatService.onlineUsers();
    res.json({ data: rows });
  }),

  conversations: asyncHandler(async (req, res) => {
    const rows = await ChatService.listConversations(req.user.id);
    res.json({ data: rows });
  }),

  conversation: asyncHandler(async (req, res) => {
    const rows = await ChatService.conversation(req.user.id, req.params.userId, req.query.limit);
    res.json({ data: rows });
  }),

  sendDirect: asyncHandler(async (req, res) => {
    const message = await ChatService.sendDirectMessage(req.user.id, req.body.recipientId, req.body.body);
    res.status(201).json({ data: message });
  }),
};
