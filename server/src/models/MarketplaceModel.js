import { query } from '../config/database.js';
import { UserModel } from './UserModel.js';

const LISTING_FIELDS = `
  l.id, l.price_coins AS "priceCoins", l.status, l.expires_at AS "expiresAt",
  l.created_at AS "createdAt", l.sold_at AS "soldAt",
  l.seller_id AS "sellerId", l.buyer_id AS "buyerId", l.inventory_id AS "inventoryId",
  i.id AS "itemId", i.sku, i.name_fa AS "itemName", i.category, i.rarity, i.metadata,
  seller.username AS "sellerUsername", seller.display_name AS "sellerDisplayName"
`;

const SORT_COLUMNS = {
  newest: 'l.created_at DESC',
  oldest: 'l.created_at ASC',
  price_asc: 'l.price_coins ASC',
  price_desc: 'l.price_coins DESC',
};

export const MarketplaceModel = {
  /** Lazily flips any past-due active listings to 'expired'. Cheap, index-backed, safe to call often. */
  async sweepExpired() {
    await query(
      `UPDATE marketplace_listings SET status = 'expired'
       WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()`
    );
  },

  async browse({ search, category, rarity, minPrice, maxPrice, sort, limit, offset }) {
    const conditions = [`l.status = 'active'`, `(l.expires_at IS NULL OR l.expires_at > now())`];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`i.name_fa ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`i.category = $${params.length}`);
    }
    if (rarity) {
      params.push(rarity);
      conditions.push(`i.rarity = $${params.length}`);
    }
    if (minPrice != null) {
      params.push(minPrice);
      conditions.push(`l.price_coins >= $${params.length}`);
    }
    if (maxPrice != null) {
      params.push(maxPrice);
      conditions.push(`l.price_coins <= $${params.length}`);
    }

    const orderBy = SORT_COLUMNS[sort] || SORT_COLUMNS.newest;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${LISTING_FIELDS}, COUNT(*) OVER() AS "totalCount"
       FROM marketplace_listings l
       JOIN items i ON i.id = l.item_id
       JOIN users seller ON seller.id = l.seller_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return { rows: rows.map(({ totalCount, ...r }) => r), total };
  },

  async getActiveById(listingId) {
    const { rows } = await query(
      `SELECT ${LISTING_FIELDS}
       FROM marketplace_listings l
       JOIN items i ON i.id = l.item_id
       JOIN users seller ON seller.id = l.seller_id
       WHERE l.id = $1`,
      [listingId]
    );
    return rows[0] || null;
  },

  async getInventoryItem(inventoryId, userId) {
    const { rows } = await query(
      `SELECT ui.id, ui.user_id AS "userId", ui.item_id AS "itemId", ui.equipped, ui.acquired_at AS "acquiredAt",
              i.name_fa AS "itemName", i.category, i.rarity, i.sku,
              EXISTS(SELECT 1 FROM marketplace_listings ml WHERE ml.inventory_id = ui.id AND ml.status = 'active') AS "isListed"
       FROM user_inventory ui
       JOIN items i ON i.id = ui.item_id
       WHERE ui.id = $1 AND ui.user_id = $2`,
      [inventoryId, userId]
    );
    return rows[0] || null;
  },

  async listInventory(userId) {
    const { rows } = await query(
      `SELECT ui.id, ui.item_id AS "itemId", ui.equipped, ui.acquired_at AS "acquiredAt",
              i.name_fa AS "itemName", i.category, i.rarity, i.sku, i.metadata,
              EXISTS(SELECT 1 FROM marketplace_listings ml WHERE ml.inventory_id = ui.id AND ml.status = 'active') AS "isListed"
       FROM user_inventory ui
       JOIN items i ON i.id = ui.item_id
       WHERE ui.user_id = $1
       ORDER BY i.rarity DESC, ui.acquired_at DESC`,
      [userId]
    );
    return rows;
  },

  async createListing(client, { inventoryId, itemId, sellerId, priceCoins, expiresAt }) {
    const { rows } = await client.query(
      `INSERT INTO marketplace_listings (inventory_id, item_id, seller_id, price_coins, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, price_coins AS "priceCoins", status, expires_at AS "expiresAt", created_at AS "createdAt"`,
      [inventoryId, itemId, sellerId, priceCoins, expiresAt]
    );
    return rows[0];
  },

  async unequip(client, inventoryId) {
    await client.query(`UPDATE user_inventory SET equipped = false WHERE id = $1`, [inventoryId]);
  },

  async cancelListing(sellerId, listingId) {
    const { rows } = await query(
      `UPDATE marketplace_listings SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND seller_id = $2 AND status = 'active'
       RETURNING id`,
      [listingId, sellerId]
    );
    return rows[0] || null;
  },

  /** Atomically claims an active, unexpired listing for a buyer. Returns null if it's no longer available. */
  async claimListing(client, listingId, buyerId) {
    const { rows } = await client.query(
      `UPDATE marketplace_listings
       SET status = 'sold', buyer_id = $2, sold_at = now()
       WHERE id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
       RETURNING id, inventory_id AS "inventoryId", item_id AS "itemId", seller_id AS "sellerId", price_coins AS "priceCoins"`,
      [listingId, buyerId]
    );
    return rows[0] || null;
  },

  async buyerAlreadyOwns(client, buyerId, itemId) {
    const { rows } = await client.query(`SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2`, [
      buyerId,
      itemId,
    ]);
    return rows.length > 0;
  },

  /** Atomic, race-safe coin debit: fails (0 rows) instead of going negative. */
  async debitCoins(client, userId, amount) {
    const { rows } = await client.query(
      `UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins`,
      [userId, amount]
    );
    return rows[0] || null;
  },

  async creditCoins(client, userId, amount) {
    return UserModel.updateEconomy(client, userId, { coinsDelta: amount });
  },

  async transferOwnership(client, inventoryId, sellerId, buyerId) {
    const { rows } = await client.query(
      `UPDATE user_inventory SET user_id = $3, equipped = false WHERE id = $1 AND user_id = $2 RETURNING id`,
      [inventoryId, sellerId, buyerId]
    );
    return rows[0] || null;
  },

  async myHistory(userId, { limit = 30, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT l.id, l.price_coins AS "priceCoins", l.status, l.created_at AS "createdAt",
              l.sold_at AS "soldAt", l.cancelled_at AS "cancelledAt",
              i.name_fa AS "itemName", i.category, i.rarity,
              CASE WHEN l.seller_id = $1 THEN 'sell' ELSE 'buy' END AS role,
              seller.display_name AS "sellerDisplayName", buyer.display_name AS "buyerDisplayName"
       FROM marketplace_listings l
       JOIN items i ON i.id = l.item_id
       JOIN users seller ON seller.id = l.seller_id
       LEFT JOIN users buyer ON buyer.id = l.buyer_id
       WHERE l.seller_id = $1 OR l.buyer_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  },
};
