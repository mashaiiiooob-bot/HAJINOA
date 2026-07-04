import { query } from '../config/database.js';

const CATEGORIES = ['economy', 'xp', 'rewards', 'matchmaking', 'tournament', 'marketplace'];

export const AdminSettingsModel = {
  CATEGORIES,

  async getAll() {
    const { rows } = await query(
      `SELECT category, settings, updated_by AS "updatedBy", updated_at AS "updatedAt" FROM admin_settings`
    );
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));
    // Any category without a saved row yet simply defaults to an empty object.
    return Object.fromEntries(
      CATEGORIES.map((c) => [c, byCategory[c] || { category: c, settings: {}, updatedBy: null, updatedAt: null }])
    );
  },

  async upsert(category, settings, updatedBy) {
    const { rows } = await query(
      `INSERT INTO admin_settings (category, settings, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (category) DO UPDATE SET settings = $2, updated_by = $3, updated_at = now()
       RETURNING category, settings, updated_by AS "updatedBy", updated_at AS "updatedAt"`,
      [category, JSON.stringify(settings), updatedBy]
    );
    return rows[0];
  },
};
