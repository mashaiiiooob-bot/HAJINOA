import { AdminSettingsModel } from '../models/AdminSettingsModel.js';
import { AdminLogService } from './AdminLogService.js';
import { errors } from '../utils/AppError.js';

export const AdminSettingsService = {
  async getAll() {
    return AdminSettingsModel.getAll();
  },

  /**
   * update() — stores whatever config the admin submits for a category. These values are
   * read-and-display only for now; wiring them into live economy/matchmaking/tournament
   * behavior would mean editing those systems' own files, which is out of scope here.
   */
  async update(adminId, category, settings) {
    if (!AdminSettingsModel.CATEGORIES.includes(category)) throw errors.validation('دسته‌بندی تنظیمات نامعتبر است');
    const updated = await AdminSettingsModel.upsert(category, settings, adminId);
    await AdminLogService.log('admin_action', 'settings.update', { actorId: adminId, metadata: { category, settings } });
    return updated;
  },
};
