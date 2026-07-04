import { AnnouncementModel } from '../models/AnnouncementModel.js';
import { AdminLogService } from './AdminLogService.js';
import { broadcastAll } from '../sockets/notifier.js';
import { errors } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

let schedulerHandle = null;

export const AnnouncementService = {
  /** send() — creates the row and, if not scheduled for later, broadcasts immediately. */
  async send(adminId, { title, body, type, scheduledAt }) {
    const announcement = await AnnouncementModel.create({
      title,
      body,
      type,
      createdBy: adminId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    });

    if (!announcement.scheduledAt) {
      broadcastAll('announcement:new', announcement);
    }

    await AdminLogService.log('admin_action', 'announcement.create', {
      actorId: adminId,
      metadata: { announcementId: announcement.id, type, scheduled: !!scheduledAt },
    });
    return announcement;
  },

  async list(page, pageSize) {
    const { rows, ...meta } = await AnnouncementModel.list({ page, pageSize });
    return { announcements: rows, ...meta };
  },

  async remove(adminId, id) {
    const removed = await AnnouncementModel.remove(id);
    if (!removed) throw errors.conflict('این اعلانیه قابل حذف نیست (ممکن است قبلاً ارسال شده باشد)');
    await AdminLogService.log('admin_action', 'announcement.delete', { actorId: adminId, metadata: { announcementId: id } });
    return { deleted: true };
  },

  /** Checks every 30s for scheduled announcements whose time has come and broadcasts them. */
  async sweepDue() {
    try {
      const due = await AnnouncementModel.findDue();
      for (const a of due) {
        broadcastAll('announcement:new', a);
        await AnnouncementModel.markSent(a.id);
      }
    } catch (err) {
      logger.error({ err }, 'Announcement scheduler sweep failed');
    }
  },

  startScheduler() {
    if (schedulerHandle) return;
    schedulerHandle = setInterval(() => this.sweepDue(), 30_000);
    schedulerHandle.unref?.();
  },
};
