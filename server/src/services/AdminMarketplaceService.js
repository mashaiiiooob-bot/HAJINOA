import { AdminMarketplaceModel } from '../models/AdminMarketplaceModel.js';
import { AdminDashboardModel } from '../models/AdminDashboardModel.js';
import { MarketplaceService } from '../services/MarketplaceService.js';
import { AdminLogService } from './AdminLogService.js';
import { notifyUser } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

export const AdminMarketplaceService = {
  async list({ search, status, category, page, pageSize }) {
    const { rows, ...meta } = await AdminMarketplaceModel.listAll({
      search: search?.trim() || null,
      status,
      category,
      page,
      pageSize,
    });
    return { listings: rows, ...meta };
  },

  async detail(listingId) {
    const listing = await AdminMarketplaceModel.getById(listingId);
    if (!listing) throw errors.notFound('آگهی یافت نشد');
    return listing;
  },

  /** removeListing() — force-cancels any active listing regardless of who created it. */
  async removeListing(adminId, listingId, reason) {
    const cancelled = await AdminMarketplaceModel.forceCancel(listingId);
    if (!cancelled) throw errors.conflict('این آگهی فعال نیست یا قبلاً حذف شده است');

    notifyUser(cancelled.sellerId, 'admin:notice', { type: 'listing_removed', listingId, reason: reason || null });
    await AdminLogService.log('marketplace', 'marketplace.listing.remove', {
      actorId: adminId,
      targetId: cancelled.sellerId,
      metadata: { listingId, reason },
    });
    return cancelled;
  },

  /**
   * forceComplete() — completes a sale on an admin's behalf by reusing MarketplaceService.buyItem()
   * verbatim, so the exact same atomic coin-transfer / ownership-transfer / anti-fraud checks apply.
   */
  async forceComplete(adminId, listingId, buyerId) {
    const result = await MarketplaceService.buyItem(buyerId, listingId);
    await AdminLogService.log('marketplace', 'marketplace.listing.force_complete', {
      actorId: adminId,
      targetId: buyerId,
      metadata: { listingId, ...result },
    });
    return result;
  },

  async statistics() {
    const [marketplace, economy] = await Promise.all([
      AdminDashboardModel.marketplaceStats(),
      AdminDashboardModel.economyStats(),
    ]);
    return { marketplace, economy };
  },
};
