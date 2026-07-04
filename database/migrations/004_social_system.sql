-- ============================================================================
-- دست یا خالی — Social system (clans, friends, DMs, notifications)
-- Builds on the existing clans / clan_members / chat_messages tables from
-- 001_init_schema.sql. No previous migration is modified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CLANS — profile, progression, announcements
-- ---------------------------------------------------------------------------
ALTER TABLE clans
    ADD COLUMN avatar_url             VARCHAR(255),
    ADD COLUMN level                  SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN xp                     BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN announcement           VARCHAR(500),
    ADD COLUMN announcement_set_by    UUID REFERENCES users(id),
    ADD COLUMN announcement_set_at    TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- FRIENDSHIPS — one row per relationship, direction preserved for who-asked-whom.
-- Only one active (pending/accepted) row may exist per unordered pair.
-- ---------------------------------------------------------------------------
CREATE TABLE friendships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at    TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX idx_friendships_active_pair
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
    WHERE status IN ('pending', 'accepted');
CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships (addressee_id, status);

-- ---------------------------------------------------------------------------
-- DIRECT MESSAGES — private 1:1 chat, kept separate from chat_messages since
-- that table's scope model (global/clan/match) doesn't fit a 2-party thread.
-- ---------------------------------------------------------------------------
CREATE TABLE direct_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            VARCHAR(1000) NOT NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sender_id <> recipient_id)
);
CREATE INDEX idx_dm_conversation
    ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);
CREATE INDEX idx_dm_recipient_unread ON direct_messages (recipient_id, read_at) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS — backs the notification panel; fanned out over sockets too.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL
                      CHECK (type IN (
                        'friend_request', 'friend_accepted', 'clan_invite', 'clan_join',
                        'clan_kicked', 'clan_promotion', 'clan_ownership_transferred', 'direct_message'
                      )),
    payload         JSONB NOT NULL DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
