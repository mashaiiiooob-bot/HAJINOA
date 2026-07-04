-- ============================================================================
-- دست یا خالی — Admin system (dashboard, moderation, logs, settings, announcements)
-- Reuses users.role ('admin') and users.status ('banned'/'suspended') from
-- 001_init_schema.sql for ban/role enforcement — nothing there is modified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Mute is chat-specific and time-boxed, distinct from account status.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN muted_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- ADMIN LOGS — a single audit trail table; `category` lets the Logs page
-- filter into "login / admin action / economy / marketplace / clan / match"
-- views without needing six near-identical tables.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(20) NOT NULL
                      CHECK (category IN ('login', 'admin_action', 'economy', 'marketplace', 'clan', 'match')),
    actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    target_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(60) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_logs_category ON admin_logs (category, created_at DESC);
CREATE INDEX idx_admin_logs_actor ON admin_logs (actor_id, created_at DESC);
CREATE INDEX idx_admin_logs_target ON admin_logs (target_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- ADMIN SETTINGS — one JSON blob per configurable area. Read/edited from the
-- Settings tab; kept generic so new fields don't need a migration each time.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_settings (
    category        VARCHAR(30) PRIMARY KEY
                      CHECK (category IN ('economy', 'xp', 'rewards', 'matchmaking', 'tournament', 'marketplace')),
    settings        JSONB NOT NULL DEFAULT '{}',
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENTS — global broadcasts, optionally scheduled.
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(120) NOT NULL,
    body            VARCHAR(1000) NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'announcement'
                      CHECK (type IN ('announcement', 'maintenance', 'event', 'tournament')),
    created_by      UUID NOT NULL REFERENCES users(id),
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_announcements_pending ON announcements (scheduled_at) WHERE sent_at IS NULL AND scheduled_at IS NOT NULL;
CREATE INDEX idx_announcements_sent ON announcements (sent_at DESC) WHERE sent_at IS NOT NULL;
