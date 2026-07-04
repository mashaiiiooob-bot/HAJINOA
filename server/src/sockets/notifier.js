/**
 * Services (called from both REST controllers and socket handlers) need a way to push
 * realtime events without importing the socket layer directly (circular-import risk).
 * `createSocketServer()` calls `setIo()` once at boot; everything else just uses `notifyUser`.
 */
let ioRef = null;

export function setIo(io) {
  ioRef = io;
}

export function notifyUser(userId, event, payload) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

export function notifyRoom(room, event, payload) {
  ioRef?.to(room).emit(event, payload);
}

/** Broadcasts to every connected socket — used for global announcements. */
export function broadcastAll(event, payload) {
  ioRef?.emit(event, payload);
}

/** Forcibly disconnects every open socket for a user — used when an admin bans/kicks them. */
export async function forceDisconnectUser(userId, reason) {
  if (!ioRef) return;
  const sockets = await ioRef.in(`user:${userId}`).fetchSockets();
  for (const s of sockets) {
    s.emit('admin:notice', { type: 'disconnected', reason });
    s.disconnect(true);
  }
}
