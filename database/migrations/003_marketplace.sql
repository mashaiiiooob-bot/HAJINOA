-- ============================================================================
-- دست یا خالی — Marketplace system
-- Adds player-to-player trading on top of the existing items / user_inventory
-- tables from 001_init_schema.sql. Ownership transfer reuses user_inventory's
-- existing UNIQUE (user_id, item_id) row by simply reassigning user_id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Marketplace listings need two more cosmetic categories than 001 defined
-- (name-color items and badges) alongside the existing borders/frames.
-- ---------------------------------------------------------------------------
ALTER TABLE items DROP CONSTRAINT items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check
    CHECK (category IN ('avatar', 'frame', 'emote', 'theme', 'booster', 'border', 'name_color', 'badge'));

-- ---------------------------------------------------------------------------
-- MARKETPLACE LISTINGS
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace_listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id    UUID NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buyer_id        UUID REFERENCES users(id),
    price_coins     BIGINT NOT NULL CHECK (price_coins > 0 AND price_coins <= 1000000000),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sold_at         TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ
);

-- A single owned item instance can only ever have one active listing at a time.
CREATE UNIQUE INDEX idx_marketplace_listings_inventory_active
    ON marketplace_listings (inventory_id) WHERE status = 'active';

CREATE INDEX idx_marketplace_listings_browse ON marketplace_listings (status, created_at DESC);
CREATE INDEX idx_marketplace_listings_item ON marketplace_listings (item_id) WHERE status = 'active';
CREATE INDEX idx_marketplace_listings_price ON marketplace_listings (price_coins) WHERE status = 'active';
CREATE INDEX idx_marketplace_listings_seller ON marketplace_listings (seller_id, created_at DESC);
CREATE INDEX idx_marketplace_listings_buyer ON marketplace_listings (buyer_id, sold_at DESC);
