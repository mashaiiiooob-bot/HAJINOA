-- ============================================================================
-- دست یا خالی — Tournament system
-- Extends the existing `tournaments` / `tournament_participants` tables
-- (created in 001_init_schema.sql) with bracket tracking + reward bookkeeping.
-- Convention follows 001: snake_case, UUID PKs, FK + ON DELETE policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TOURNAMENTS — bracket/progress + champion bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE tournaments
    ALTER COLUMN max_players SET DEFAULT 8,
    ALTER COLUMN starts_at SET DEFAULT now(),
    ADD COLUMN current_round  SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN champion_id    UUID REFERENCES users(id),
    ADD COLUMN runner_up_id   UUID REFERENCES users(id);

CREATE INDEX idx_tournaments_status ON tournaments (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- TOURNAMENT PARTICIPANTS — elimination + reward tracking
-- ---------------------------------------------------------------------------
ALTER TABLE tournament_participants
    ADD COLUMN status              VARCHAR(20) NOT NULL DEFAULT 'registered'
                                      CHECK (status IN ('registered', 'eliminated', 'champion')),
    ADD COLUMN eliminated_round    SMALLINT,
    ADD COLUMN coins_awarded       BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN xp_awarded          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN rank_points_awarded INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- TOURNAMENT MATCHES — the bracket itself.
-- round_number: 1 = quarter-final, 2 = semi-final, 3 = final (8-player knockout).
-- bracket_slot: 0-indexed position within the round, used to pair winners
-- into the next round (slot N and N+1 of round R feed slot N/2 of round R+1).
-- ---------------------------------------------------------------------------
CREATE TABLE tournament_matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number    SMALLINT NOT NULL,
    bracket_slot    SMALLINT NOT NULL,
    player1_id      UUID REFERENCES users(id),
    player2_id      UUID REFERENCES users(id),
    winner_id       UUID REFERENCES users(id),
    match_id        UUID REFERENCES matches(id) ON DELETE SET NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'completed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tournament_id, round_number, bracket_slot)
);
CREATE INDEX idx_tournament_matches_tournament ON tournament_matches (tournament_id, round_number);
CREATE INDEX idx_tournament_matches_match ON tournament_matches (match_id);

-- ---------------------------------------------------------------------------
-- New game mode so tournament matches show up correctly alongside classic/quick/duo.
-- ---------------------------------------------------------------------------
INSERT INTO game_modes (code, name_fa, team_size, rounds_to_win) VALUES
    ('tournament', 'مسابقات قهرمانی', 1, 3)
ON CONFLICT (code) DO NOTHING;
