import { query } from '../config/database.js';

const FIELDS = `
  id, title, body, type, created_by AS "createdBy",
  scheduled_at AS "scheduledAt", sent_at AS "sentAt", created_at AS "createdAt"
`;

export const AnnouncementModel = {
  async create({ title, body, type, createdBy, scheduledAt }) {
    const { rows } = await query(
      `INSERT INTO announcements (title, body, type, created_by, scheduled_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FIELDS}`,
      [title, body, type, createdBy, scheduledAt || null, scheduledAt ? null : new Date()]
    );
    return rows[0];
  },

  async list({ page, pageSize }) {
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const { rows } = await query(
      `SELECT ${FIELDS}, COUNT(*) OVER() AS "totalCount" FROM announcements
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
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

  async findDue() {
    const { rows } = await query(
      `SELECT ${FIELDS} FROM announcements WHERE sent_at IS NULL AND scheduled_at <= now()`
    );
    return rows;
  },

  async markSent(id) {
    await query(`UPDATE announcements SET sent_at = now() WHERE id = $1`, [id]);
  },

  async remove(id) {
    const { rowCount } = await query(`DELETE FROM announcements WHERE id = $1 AND sent_at IS NULL`, [id]);
    return rowCount > 0;
  },
};
