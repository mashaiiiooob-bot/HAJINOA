/**
 * Tracks which users currently have at least one open socket connection.
 * Ref-counted so a user with several tabs/devices open only goes "offline"
 * once every connection has closed.
 */
const connectionCounts = new Map(); // userId -> open socket count

export const presence = {
  markOnline(userId) {
    const next = (connectionCounts.get(userId) || 0) + 1;
    connectionCounts.set(userId, next);
    return next === 1; // true the moment they go from offline -> online
  },

  markOffline(userId) {
    const current = connectionCounts.get(userId) || 0;
    const next = Math.max(current - 1, 0);
    if (next === 0) connectionCounts.delete(userId);
    else connectionCounts.set(userId, next);
    return next === 0; // true the moment they go from online -> offline
  },

  isOnline(userId) {
    return connectionCounts.has(userId);
  },

  onlineUserIds() {
    return [...connectionCounts.keys()];
  },
};
