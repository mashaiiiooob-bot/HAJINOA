import { TournamentService } from '../services/TournamentService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/** Maps internal DB status values onto the three states the product spec calls for. */
function displayStatus(status) {
  if (status === 'registration') return 'waiting';
  if (status === 'completed') return 'finished';
  return status; // 'active' | 'cancelled'
}

function withDisplayStatus(t) {
  return { ...t, displayStatus: displayStatus(t.status) };
}

export const TournamentController = {
  list: asyncHandler(async (req, res) => {
    const rows = await TournamentService.listOpenAndActive();
    res.json({ data: rows.map(withDisplayStatus) });
  }),

  getById: asyncHandler(async (req, res) => {
    const tournament = await TournamentService.getById(req.params.id);
    res.json({ data: withDisplayStatus(tournament) });
  }),

  join: asyncHandler(async (req, res) => {
    const result = await TournamentService.joinTournament(req.user.id);
    res.status(201).json({ data: result });
  }),

  leave: asyncHandler(async (req, res) => {
    await TournamentService.leaveTournament(req.user.id, req.params.id);
    res.status(204).send();
  }),

  myHistory: asyncHandler(async (req, res) => {
    const rows = await TournamentService.myHistory(req.user.id);
    res.json({ data: rows });
  }),
};
