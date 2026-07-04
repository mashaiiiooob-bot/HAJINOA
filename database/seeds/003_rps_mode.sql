-- ============================================================================
-- دست یا خالی — new game: سنگ کاغذ قیچی (Rock–Paper–Scissors)
-- A second real-time 1v1 mode, reusing the exact matches/match_participants/
-- match_rounds tables and the same createMatch()/finishMatch() flow as the
-- original hand-guessing game — only round resolution rules differ.
-- ============================================================================
INSERT INTO game_modes (code, name_fa, team_size, rounds_to_win) VALUES
    ('rps', 'سنگ کاغذ قیچی', 1, 3)
ON CONFLICT (code) DO NOTHING;
