import { ClanModel } from '../models/ClanModel.js';
import { ChatModel } from '../models/ChatModel.js';
import { NotificationService } from './NotificationService.js';
import { notifyRoom } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';

const JOIN_XP_REWARD = 50;
const TAG_RE = /^[A-Za-z0-9\u0600-\u06FF]{2,4}$/;

export const ClanService = {
  /** createClan() — founds a new clan with the creator as its leader. */
  async createClan(ownerId, { name, tag, description, avatarUrl }) {
    const existing = await ClanModel.currentClanForUser(ownerId);
    if (existing) throw errors.conflict('شما در حال حاضر عضو یک کلن هستید');

    const cleanName = name.trim();
    const cleanTag = tag.trim().toUpperCase();
    if (!TAG_RE.test(cleanTag)) throw errors.validation('تگ کلن باید بین ۲ تا ۴ کاراکتر باشد');

    const taken = await ClanModel.nameOrTagTaken(cleanName, cleanTag);
    if (taken) throw errors.conflict('این نام یا تگ قبلاً استفاده شده است');

    return ClanModel.create({ name: cleanName, tag: cleanTag, description, avatarUrl, ownerId });
  },

  async getClan(clanId) {
    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    const [members, statistics] = await Promise.all([ClanModel.listMembers(clanId), ClanModel.statistics(clanId)]);
    return { ...clan, members, statistics };
  },

  async browse({ search, page = 1, pageSize = 20 }) {
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const { rows, total } = await ClanModel.browse({ search: search?.trim() || null, limit, offset });
    return { clans: rows, page: Math.max(Number(page) || 1, 1), pageSize: limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) };
  },

  async leaderboard() {
    return ClanModel.leaderboard();
  },

  async myClan(userId) {
    return ClanModel.currentClanForUser(userId);
  },

  /** joinClan() — open join, capacity-limited; one clan per player. */
  async joinClan(userId, clanId) {
    const existing = await ClanModel.currentClanForUser(userId);
    if (existing) throw errors.conflict('شما در حال حاضر عضو یک کلن هستید');

    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');

    const count = await ClanModel.memberCount(clanId);
    if (count >= ClanModel.MAX_MEMBERS) throw errors.conflict('این کلن پر است');

    await ClanModel.addMember(clanId, userId, 'member');
    await ClanModel.addXp(clanId, JOIN_XP_REWARD);

    await NotificationService.send(clan.ownerId, 'clan_join', { clanId, clanName: clan.name, userId });
    notifyRoom(`clan:${clanId}`, 'clan:member:joined', { clanId, userId });

    return ClanModel.findById(clanId);
  },

  /** leaveClan() — the owner can't simply leave; must transfer ownership or disband first. */
  async leaveClan(userId, clanId) {
    const membership = await ClanModel.getMembership(clanId, userId);
    if (!membership) throw errors.notFound('شما عضو این کلن نیستید');

    const clan = await ClanModel.findById(clanId);
    if (clan.ownerId === userId) {
      const count = await ClanModel.memberCount(clanId);
      if (count > 1) {
        throw errors.conflict('ابتدا مالکیت کلن را منتقل کنید یا کلن را منحل کنید');
      }
      await ClanModel.deleteClan(clanId); // last member leaving disbands the clan
      return { disbanded: true };
    }

    await ClanModel.removeMember(clanId, userId);
    notifyRoom(`clan:${clanId}`, 'clan:member:left', { clanId, userId });
    return { disbanded: false };
  },

  /** kickMember() — owner-only. */
  async kickMember(actingUserId, clanId, targetUserId) {
    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    if (clan.ownerId !== actingUserId) throw errors.forbidden('فقط مالک کلن می‌تواند اعضا را اخراج کند');
    if (targetUserId === actingUserId) throw errors.validation('نمی‌توانید خودتان را اخراج کنید');

    const removed = await ClanModel.removeMember(clanId, targetUserId);
    if (!removed) throw errors.notFound('این کاربر عضو کلن نیست');

    await NotificationService.send(targetUserId, 'clan_kicked', { clanId, clanName: clan.name });
    notifyRoom(`clan:${clanId}`, 'clan:member:kicked', { clanId, userId: targetUserId });
    return { kicked: true };
  },

  /** transferOwnership() — owner-only, target must already be a member. */
  async transferOwnership(actingUserId, clanId, targetUserId) {
    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    if (clan.ownerId !== actingUserId) throw errors.forbidden('فقط مالک کلن می‌تواند مالکیت را منتقل کند');
    if (targetUserId === actingUserId) throw errors.validation('شما در حال حاضر مالک هستید');

    const membership = await ClanModel.getMembership(clanId, targetUserId);
    if (!membership) throw errors.notFound('کاربر مورد نظر عضو این کلن نیست');

    await ClanModel.setOwner(clanId, targetUserId);
    await ClanModel.setRole(clanId, targetUserId, 'leader');
    await ClanModel.setRole(clanId, actingUserId, 'member');

    await NotificationService.send(targetUserId, 'clan_promotion', { clanId, clanName: clan.name, newRole: 'owner' });
    notifyRoom(`clan:${clanId}`, 'clan:ownership:transferred', { clanId, newOwnerId: targetUserId });
    return { newOwnerId: targetUserId };
  },

  async setAnnouncement(actingUserId, clanId, announcement) {
    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    if (clan.ownerId !== actingUserId) throw errors.forbidden('فقط مالک کلن می‌تواند اعلامیه ثبت کند');

    const text = String(announcement || '').trim().slice(0, 500);
    const result = await ClanModel.setAnnouncement(clanId, actingUserId, text || null);
    notifyRoom(`clan:${clanId}`, 'clan:announcement:updated', { clanId, ...result });
    return result;
  },

  /** inviteToClan() — owner-only nudge; sends a notification, doesn't force a join. */
  async inviteToClan(actingUserId, clanId, targetUserId) {
    const clan = await ClanModel.findById(clanId);
    if (!clan) throw errors.notFound('کلن یافت نشد');
    if (clan.ownerId !== actingUserId) throw errors.forbidden('فقط مالک کلن می‌تواند دعوت کند');

    const existingMembership = await ClanModel.currentClanForUser(targetUserId);
    if (existingMembership) throw errors.conflict('این کاربر در حال حاضر عضو یک کلن است');

    await NotificationService.send(targetUserId, 'clan_invite', { clanId, clanName: clan.name, clanTag: clan.tag, invitedBy: actingUserId });
    return { invited: true };
  },

  /** sendClanChat() — persists + returns a clan-chat message (membership-checked). Broadcast happens in the socket layer. */
  async sendClanChat(userId, clanId, body) {
    const membership = await ClanModel.getMembership(clanId, userId);
    if (!membership) throw errors.forbidden('شما عضو این کلن نیستید');

    const text = ChatModel.sanitize(body);
    if (!text) throw errors.validation('پیام نمی‌تواند خالی باشد');

    return ChatModel.insertMessage({ scope: 'clan', scopeRefId: clanId, userId, body: text });
  },

  async clanChatHistory(userId, clanId, { limit = 50 } = {}) {
    const membership = await ClanModel.getMembership(clanId, userId);
    if (!membership) throw errors.forbidden('شما عضو این کلن نیستید');
    return ChatModel.history('clan', clanId, limit);
  },
};
