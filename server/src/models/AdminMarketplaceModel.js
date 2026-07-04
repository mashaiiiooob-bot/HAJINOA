import { query } from '../config/database.js';

const LISTING_FIELDS = `
  l.id, l.price_coins AS "priceCoins", l.status, l.expires_at AS "expiresAt",
  l.created_at AS "createdAt", l.sold_at AS "soldAt", l.cancelled_at AS "cancelledAt",
  l.seller_id AS "sellerId", l.buyer_id AS "buyerId", l.inventory_id AS "inventoryId",
  i.id AS "itemId", i.sku, i.name_fa AS "itemName", i.category, i.rarity,
  seller.username AS "sellerUsername", seller.display_name AS "sellerDisplayName",
  buyer.username AS "buyerUsername", buyer.display_name AS "buyerDisplayName"
`;

export const AdminMarketplaceModel = {
  async listAll({ search, status, category, page, pageSize }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.name_fa ILIKE $${params.length} OR seller.username ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`i.category = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT ${LISTING_FIELDS}, COUNT(*) OVER() AS "totalCount"
       FROM marketplace_listings l
       JOIN items i ON i.id = l.item_id
       JOIN users seller ON seller.id = l.seller_id
       LEFT JOIN users buyer ON buyer.id = l.buyer_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return {
      rows: rows.map(({ totalCount, ...r }) => r),
      total,
      page: Math.max(Number(page) || 1, 1),
      pageSize: limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  },

  async getById(listingId) {
    const { rows } = await query(
      `SELECT ${LISTING_FIELDS} FROM marketplace_listings l
       JOIN items i ON i.id = l.item_id
       JOIN users seller ON seller.id = l.seller_id
       LEFT JOIN users buyer ON buyer.id = l.buyer_id
       WHERE l.id = $1`,
      [listingId]
    );
    return rows[0] || null;
  },

  async forceCancel(listingId) {
    const { rows } = await query(
      `UPDATE marketplace_listings SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING id, seller_id AS "sellerId", item_id AS "itemId"`,
      [listingId]
    );
    return rows[0] || null;
  },
};
