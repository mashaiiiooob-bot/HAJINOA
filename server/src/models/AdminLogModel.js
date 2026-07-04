import { query } from '../config/database.js';

export const AdminLogModel = {
  async create({ category, actorId, targetId, action, metadata = {} }) {
    const { rows } = await query(
      `INSERT INTO admin_logs (category, actor_id, target_id, action, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category, actor_id AS "actorId", target_id AS "targetId", action, metadata, created_at AS "createdAt"`,
      [category, actorId || null, targetId || null, action, JSON.stringify(metadata)]
    );
    return rows[0];
  },

  async list({ category, actorId, targetId, limit, offset }) {
    const conditions = [];
    const params = [];
    if (category) {
      params.push(category);
      conditions.push(`al.category = $${params.length}`);
    }
    if (actorId) {
      params.push(actorId);
      conditions.push(`al.actor_id = $${params.length}`);
    }
    if (targetId) {
      params.push(targetId);
      conditions.push(`al.target_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT al.id, al.category, al.action, al.metadata, al.created_at AS "createdAt",
              actor.id AS "actorId", actor.display_name AS "actorDisplayName",
              target.id AS "targetId", target.display_name AS "targetDisplayName",
              COUNT(*) OVER() AS "totalCount"
       FROM admin_logs al
       LEFT JOIN users actor ON actor.id = al.actor_id
       LEFT JOIN users target ON target.id = al.target_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    const total = rows[0] ? Number(rows[0].totalCount) : 0;
    return { rows: rows.map(({ totalCount, ...r }) => r), total };
  },
};
