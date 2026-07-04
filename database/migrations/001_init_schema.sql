-- ============================================================================
-- دست یا خالی — Initial schema
-- Engine target: PostgreSQL 15+
-- Convention: snake_case, UUID PKs, soft references via FK + ON DELETE policy
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive usernames/emails

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            CITEXT NOT NULL UNIQUE,
    email               CITEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    display_name        VARCHAR(60) NOT NULL,
    avatar_url          TEXT,
    role                VARCHAR(20) NOT NULL DEFAULT 'player'
                          CHECK (role IN ('player', 'moderator', 'admin')),
    level               INTEGER NOT NULL DEFAULT 1,
    xp                  INTEGER NOT NULL DEFAULT 0,
    coins               BIGINT NOT NULL DEFAULT 1000,
    gems                BIGINT NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended', 'banned', 'deleted')),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    email_verified_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_level ON users (level DESC);
CREATE INDEX idx_users_last_seen ON users (last_seen_at DESC);

-- Refresh tokens kept server-side (rotation + revocation support)
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- PLAYER STATS (1:1 with users, separated to keep hot row small/cacheable)
-- ---------------------------------------------------------------------------
CREATE TABLE player_stats (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games_played    INTEGER NOT NULL DEFAULT 0,
    games_won       INTEGER NOT NULL DEFAULT 0,
    games_lost      INTEGER NOT NULL DEFAULT 0,
    games_drawn     INTEGER NOT NULL DEFAULT 0,
    win_streak      INTEGER NOT NULL DEFAULT 0,
    best_win_streak INTEGER NOT NULL DEFAULT 0,
    rank_points     INTEGER NOT NULL DEFAULT 1000,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_player_stats_rank ON player_stats (rank_points DESC);

-- ---------------------------------------------------------------------------
-- GAME MODES & MATCHES
-- ---------------------------------------------------------------------------
CREATE TABLE game_modes (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(20) NOT NULL UNIQUE,   -- classic | quick | duo | custom
    name_fa         VARCHAR(60) NOT NULL,
    team_size       SMALLINT NOT NULL DEFAULT 1,
    rounds_to_win   SMALLINT NOT NULL DEFAULT 3
);

CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode_id         SMALLINT NOT NULL REFERENCES game_modes(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'completed', 'aborted')),
    is_ranked       BOOLEAN NOT NULL DEFAULT true,
    stake_coins     BIGINT NOT NULL DEFAULT 0,
    winner_id       UUID REFERENCES users(id),
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_status ON matches (status);
CREATE INDEX idx_matches_created ON matches (created_at DESC);

CREATE TABLE match_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team            SMALLINT NOT NULL DEFAULT 0,
    rank_points_before INTEGER,
    rank_points_after  INTEGER,
    UNIQUE (match_id, user_id)
);
CREATE INDEX idx_match_participants_user ON match_participants (user_id);

CREATE TABLE match_rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    round_number    SMALLINT NOT NULL,
    moves           JSONB NOT NULL,        -- {"user_id": "hand"} snapshot, audited server-side
    round_winner_id UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, round_number)
);

-- ---------------------------------------------------------------------------
-- TOURNAMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE tournaments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    prize_coins     BIGINT NOT NULL DEFAULT 0,
    max_players     INTEGER NOT NULL DEFAULT 32,
    status          VARCHAR(20) NOT NULL DEFAULT 'registration'
                      CHECK (status IN ('registration', 'active', 'completed', 'cancelled')),
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tournament_participants (
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed            INTEGER,
    placement       INTEGER,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, user_id)
);

-- ---------------------------------------------------------------------------
-- CLANS
-- ---------------------------------------------------------------------------
CREATE TABLE clans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(60) NOT NULL UNIQUE,
    tag             VARCHAR(4) NOT NULL UNIQUE,
    description     TEXT,
    owner_id        UUID NOT NULL REFERENCES users(id),
    trophies        BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clan_members (
    clan_id         UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member'
                      CHECK (role IN ('member', 'officer', 'leader')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (clan_id, user_id)
);
CREATE UNIQUE INDEX idx_clan_members_one_clan_per_user ON clan_members (user_id);

-- ---------------------------------------------------------------------------
-- MISSIONS / PROGRESSION
-- ---------------------------------------------------------------------------
CREATE TABLE missions (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    title_fa        VARCHAR(120) NOT NULL,
    period          VARCHAR(10) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
    target_count    INTEGER NOT NULL,
    reward_xp       INTEGER NOT NULL DEFAULT 0,
    reward_coins    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id      INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    progress        INTEGER NOT NULL DEFAULT 0,
    completed_at    TIMESTAMPTZ,
    claimed_at      TIMESTAMPTZ,
    period_start    DATE NOT NULL,
    UNIQUE (user_id, mission_id, period_start)
);
CREATE INDEX idx_user_missions_user ON user_missions (user_id, period_start);

-- ---------------------------------------------------------------------------
-- MARKETPLACE / INVENTORY
-- ---------------------------------------------------------------------------
CREATE TABLE items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku             VARCHAR(60) NOT NULL UNIQUE,
    name_fa         VARCHAR(100) NOT NULL,
    category        VARCHAR(30) NOT NULL CHECK (category IN ('avatar', 'frame', 'emote', 'theme', 'booster')),
    price_coins     BIGINT,
    price_gems      BIGINT,
    rarity          VARCHAR(20) NOT NULL DEFAULT 'common'
                      CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE user_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    equipped        BOOLEAN NOT NULL DEFAULT false,
    acquired_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_id)
);

-- ---------------------------------------------------------------------------
-- CHAT (lightweight persistence; live transport is via websocket)
-- ---------------------------------------------------------------------------
CREATE TABLE chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope           VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'clan', 'match')),
    scope_ref_id    UUID,                      -- clan_id or match_id, NULL for global
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            VARCHAR(500) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_scope ON chat_messages (scope, scope_ref_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- AUDIT LOG (security requirement: track sensitive mutations)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(60) NOT NULL,
    ip_address      INET,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at auto-touch trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
