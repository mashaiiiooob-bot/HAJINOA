import { ClanModel } from '../models/ClanModel.js';
import { logger } from '../utils/logger.js';

/**
 * Clan chat itself flows through the shared chat:send/chat:message events (scope='clan',
 * scopeRefId=clanId) in chatSocket.js — that's where membership is checked and messages
 * are persisted. This module only manages joining a member's own clan room automatically.
 */
export function registerClanEvents(io, socket) {
  socket.on('clan:watch', async ({ clanId } = {}) => {
    if (!clanId) return;
    try {
      const membership = await ClanModel.getMembership(clanId, socket.userId);
      if (!membership) return;
      socket.join(`clan:${clanId}`);
    } catch (err) {
      logger.error({ err, clanId }, 'clan:watch failed');
    }
  });

  socket.on('clan:unwatch', ({ clanId } = {}) => {
    if (!clanId) return;
    socket.leave(`clan:${clanId}`);
  });
}

/** Called once on connection so a member's socket is already subscribed to their clan room. */
export async function autoJoinClanRoom(socket) {
  try {
    const membership = await ClanModel.currentClanForUser(socket.userId);
    if (membership) socket.join(`clan:${membership.clanId}`);
  } catch (err) {
    logger.error({ err, userId: socket.userId }, 'Failed to auto-join clan room');
  }
}
