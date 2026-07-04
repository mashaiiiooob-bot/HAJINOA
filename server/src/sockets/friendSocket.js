import { FriendModel } from '../models/FriendModel.js';
import { presence } from './presence.js';
import { notifyUser } from './notifier.js';
import { logger } from '../utils/logger.js';

/**
 * Friend requests/accepts/removals all go through the REST layer (FriendController), which
 * already pushes 'notification:new' via NotificationService. This module only handles the
 * presence side: telling a user's friends the moment they come online or go offline.
 */
export async function broadcastPresence(userId, online) {
  try {
    const friendIds = await FriendModel.friendIds(userId);
    for (const friendId of friendIds) {
      notifyUser(friendId, 'friend:presence', { userId, online });
    }
  } catch (err) {
    logger.error({ err, userId }, 'Failed to broadcast presence to friends');
  }
}

export function registerFriendEvents(io, socket) {
  socket.on('friend:presence:request', async ({ userIds = [] } = {}) => {
    const result = userIds.slice(0, 200).map((id) => ({ userId: id, online: presence.isOnline(id) }));
    socket.emit('friend:presence:snapshot', result);
  });
}
