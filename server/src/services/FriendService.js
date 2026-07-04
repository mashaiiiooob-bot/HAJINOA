import { FriendModel } from '../models/FriendModel.js';
import { UserModel } from '../models/UserModel.js';
import { NotificationService } from './NotificationService.js';
import { presence } from '../sockets/presence.js';
import { errors } from '../utils/AppError.js';

export const FriendService = {
  /** sendFriendRequest() */
  async sendFriendRequest(requesterId, addresseeId) {
    if (requesterId === addresseeId) throw errors.validation('نمی‌توانید به خودتان درخواست دوستی بفرستید');

    const addressee = await UserModel.findById(addresseeId);
    if (!addressee) throw errors.notFound('کاربر یافت نشد');

    const existing = await FriendModel.findActiveBetween(requesterId, addresseeId);
    if (existing) {
      throw errors.conflict(
        existing.status === 'accepted' ? 'شما با این کاربر دوست هستید' : 'درخواست دوستی قبلاً ارسال شده است'
      );
    }

    const request = await FriendModel.create(requesterId, addresseeId);
    const requester = await UserModel.findById(requesterId);
    await NotificationService.send(addresseeId, 'friend_request', {
      friendshipId: request.id,
      fromUserId: requesterId,
      fromDisplayName: requester.displayName,
    });
    return request;
  },

  /** acceptFriendRequest() */
  async acceptFriendRequest(userId, friendshipId) {
    const request = await FriendModel.findById(friendshipId);
    if (!request || request.addresseeId !== userId) throw errors.notFound('درخواست دوستی یافت نشد');
    if (request.status !== 'pending') throw errors.conflict('این درخواست دیگر معتبر نیست');

    const updated = await FriendModel.setStatus(friendshipId, 'accepted');
    const accepter = await UserModel.findById(userId);
    await NotificationService.send(request.requesterId, 'friend_accepted', {
      friendshipId,
      byUserId: userId,
      byDisplayName: accepter.displayName,
    });
    return updated;
  },

  /** rejectFriendRequest() */
  async rejectFriendRequest(userId, friendshipId) {
    const request = await FriendModel.findById(friendshipId);
    if (!request || request.addresseeId !== userId) throw errors.notFound('درخواست دوستی یافت نشد');
    if (request.status !== 'pending') throw errors.conflict('این درخواست دیگر معتبر نیست');
    return FriendModel.setStatus(friendshipId, 'rejected');
  },

  /** cancelFriendRequest() — requester withdraws their own pending request. */
  async cancelFriendRequest(userId, friendshipId) {
    const request = await FriendModel.findById(friendshipId);
    if (!request || request.requesterId !== userId) throw errors.notFound('درخواست دوستی یافت نشد');
    if (request.status !== 'pending') throw errors.conflict('این درخواست دیگر معتبر نیست');
    return FriendModel.setStatus(friendshipId, 'cancelled');
  },

  /** removeFriend() */
  async removeFriend(userId, friendId) {
    const removed = await FriendModel.deleteAccepted(userId, friendId);
    if (!removed) throw errors.notFound('این کاربر در لیست دوستان شما نیست');
    return { removed: true };
  },

  async listFriends(userId) {
    const friends = await FriendModel.listFriends(userId);
    return friends.map((f) => ({ ...f, isOnline: presence.isOnline(f.id) }));
  },

  async listRequests(userId) {
    const [incoming, outgoing] = await Promise.all([FriendModel.listIncoming(userId), FriendModel.listOutgoing(userId)]);
    return { incoming, outgoing };
  },

  /** friend profile — public profile + friendship state relative to the viewer. */
  async friendProfile(viewerId, targetUserId) {
    const user = await UserModel.findById(targetUserId);
    if (!user) throw errors.notFound('کاربر یافت نشد');
    const relation = await FriendModel.findActiveBetween(viewerId, targetUserId);
    return {
      ...user,
      isOnline: presence.isOnline(user.id),
      friendshipStatus: relation ? relation.status : 'none',
      friendshipId: relation?.id || null,
      isRequester: relation?.requesterId === viewerId,
    };
  },

  /** search() */
  async search(userId, term) {
    const clean = term?.trim();
    if (!clean || clean.length < 2) return [];
    const users = await FriendModel.search(userId, clean);
    return users.map((u) => ({ ...u, isOnline: presence.isOnline(u.id) }));
  },
};
