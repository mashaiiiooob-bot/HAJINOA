import { MatchService } from '../services/MatchService.js';
import { UserModel } from '../models/UserModel.js';
import { logger } from '../utils/logger.js';

/**
 * Single-process matchmaking queue, keyed by mode.
 * NOTE: this is intentionally simple for a single Node instance.
 * To run multiple API instances, replace with a Redis list + a dedicated
 * matchmaker worker so all instances share one queue (see README "Scaling").
 */
const queues = new Map(); // modeCode -> [{ socket, userId }]

function getQueue(mode) {
  if (!queues.has(mode)) queues.set(mode, []);
  return queues.get(mode);
}

export function registerMatchmaking(io, socket) {
  socket.on('queue:join', async ({ mode = 'classic', ranked = true } = {}) => {
    const key = `${mode}:${ranked}`;
    const queue = getQueue(key);

    // Avoid duplicate entries if the client double-fires the event.
    if (queue.some((q) => q.userId === socket.userId)) return;
    queue.push({ socket, userId: socket.userId });
    socket.emit('queue:status', { state: 'searching' });

    if (queue.length >= 2) {
      const [a, b] = queue.splice(0, 2);
      try {
        const matchId = await MatchService.createMatch({
          modeCode: mode,
          isRanked: ranked,
          player1Id: a.userId,
          player2Id: b.userId,
        });
        const [userA, userB] = await Promise.all([
          UserModel.findById(a.userId),
          UserModel.findById(b.userId),
        ]);

        for (const [me, opp] of [[a, userB], [b, userA]]) {
          me.socket.join(`match:${matchId}`);
          me.socket.emit('queue:matched', { matchId, opponent: opp, mode, ranked });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to create match');
        a.socket.emit('queue:error', { message: 'خطا در یافتن حریف' });
        b.socket.emit('queue:error', { message: 'خطا در یافتن حریف' });
      }
    }
  });

  socket.on('queue:leave', ({ mode = 'classic', ranked = true } = {}) => {
    const key = `${mode}:${ranked}`;
    const queue = getQueue(key);
    const idx = queue.findIndex((q) => q.userId === socket.userId);
    if (idx !== -1) queue.splice(idx, 1);
    socket.emit('queue:status', { state: 'idle' });
  });

  socket.on('disconnect', () => {
    for (const queue of queues.values()) {
      const idx = queue.findIndex((q) => q.userId === socket.userId);
      if (idx !== -1) queue.splice(idx, 1);
    }
  });
}
