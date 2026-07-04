import { withTransaction } from '../config/database.js';
import { MarketplaceModel } from '../models/MarketplaceModel.js';
import { errors } from '../utils/AppError.js';

const MIN_PRICE = 1;
const MAX_PRICE = 1_000_000_000;
const MAX_LISTING_HOURS = 24 * 14; // two weeks, if the seller opts into an expiration

export const MarketplaceService = {
  async browse({ search, category, rarity, minPrice, maxPrice, sort, page = 1, pageSize = 20 }) {
    await MarketplaceModel.sweepExpired();
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    const { rows, total } = await MarketplaceModel.browse({
      search: search?.trim() || null,
      category: category || null,
      rarity: rarity || null,
      minPrice: minPrice != null ? Number(minPrice) : null,
      maxPrice: maxPrice != null ? Number(maxPrice) : null,
      sort,
      limit,
      offset,
    });

    return {
      listings: rows,
      page: Math.max(Number(page) || 1, 1),
      pageSize: limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  },

  async getInventory(userId) {
    return MarketplaceModel.listInventory(userId);
  },

  /** listItem() — puts an owned cosmetic item up for sale. */
  async listItem(sellerId, { inventoryId, priceCoins, expiresInHours }) {
    if (!Number.isInteger(priceCoins) || priceCoins < MIN_PRICE || priceCoins > MAX_PRICE) {
      throw errors.validation('قیمت آیتم نامعتبر است');
    }
    if (expiresInHours != null && (expiresInHours <= 0 || expiresInHours > MAX_LISTING_HOURS)) {
      throw errors.validation('مدت زمان انقضا نامعتبر است');
    }

    const item = await MarketplaceModel.getInventoryItem(inventoryId, sellerId);
    if (!item) throw errors.notFound('این آیتم در انبار شما یافت نشد');
    if (item.isListed) throw errors.conflict('این آیتم در حال حاضر برای فروش گذاشته شده است');

    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3_600_000) : null;

    return withTransaction(async (client) => {
      await MarketplaceModel.unequip(client, inventoryId);
      try {
        const listing = await MarketplaceModel.createListing(client, {
          inventoryId,
          itemId: item.itemId,
          sellerId,
          priceCoins,
          expiresAt,
        });
        return { ...listing, itemName: item.itemName, category: item.category, rarity: item.rarity };
      } catch (err) {
        // Unique-index race: someone else listed this exact inventory row a split second earlier.
        if (err.code === '23505') throw errors.conflict('این آیتم در حال حاضر برای فروش گذاشته شده است');
        throw err;
      }
    });
  },

  /** removeListing() — cancels an active listing owned by the requester. */
  async removeListing(sellerId, listingId) {
    const cancelled = await MarketplaceModel.cancelListing(sellerId, listingId);
    if (!cancelled) throw errors.notFound('آگهی فعال یافت نشد یا متعلق به شما نیست');
    return cancelled;
  },

  /**
   * buyItem() — atomic purchase: claims the listing, verifies balance & ownership rules, moves
   * coins seller<-buyer, and transfers the inventory row. Any failure rolls the whole thing back,
   * so a listing can never end up "sold" without a coin transfer, or vice-versa.
   */
  async buyItem(buyerId, listingId) {
    return withTransaction(async (client) => {
      const claimed = await MarketplaceModel.claimListing(client, listingId, buyerId);
      if (!claimed) throw errors.conflict('این آگهی دیگر در دسترس نیست');

      if (claimed.sellerId === buyerId) {
        throw errors.conflict('شما نمی‌توانید آگهی خودتان را خریداری کنید');
      }

      const alreadyOwns = await MarketplaceModel.buyerAlreadyOwns(client, buyerId, claimed.itemId);
      if (alreadyOwns) throw errors.conflict('شما قبلاً این آیتم را در انبار خود دارید');

      const debited = await MarketplaceModel.debitCoins(client, buyerId, claimed.priceCoins);
      if (!debited) throw errors.conflict('موجودی سکه شما کافی نیست');

      await MarketplaceModel.creditCoins(client, claimed.sellerId, claimed.priceCoins);

      const transferred = await MarketplaceModel.transferOwnership(
        client,
        claimed.inventoryId,
        claimed.sellerId,
        buyerId
      );
      if (!transferred) throw errors.conflict('انتقال مالکیت آیتم با خطا مواجه شد');

      return {
        listingId: claimed.id,
        itemId: claimed.itemId,
        priceCoins: claimed.priceCoins,
        sellerId: claimed.sellerId,
      };
    });
  },

  async myHistory(userId, page = 1, pageSize = 30) {
    const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 50);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    return MarketplaceModel.myHistory(userId, { limit, offset });
  },
};
