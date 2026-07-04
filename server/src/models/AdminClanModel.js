import { query } from '../config/database.js';

export const AdminClanModel = {
  async listAll({ search, page, pageSize }) {
    const conditions = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.tag ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT c.id, c.name, c.tag, c.description, c.avatar_url AS "avatarUrl", c.owner_id AS "ownerId",
              c.trophies, c.level, c.xp, c.created_at AS "createdAt",
              owner.display_name AS "ownerDisplayName",
              (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS "memberCount",
              COUNT(*) OVER() AS "totalCount"
       FROM clans c
       JOIN users owner ON owner.id = c.owner_id
       ${where}
       ORDER BY c.created_at DESC
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

  async update(clanId, { name, tag, description, avatarUrl }) {
    const sets = [];
    const params = [clanId];
    if (name !== undefined) {
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (tag !== undefined) {
      params.push(tag);
      sets.push(`tag = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      sets.push(`description = $${params.length}`);
    }
    if (avatarUrl !== undefined) {
      params.push(avatarUrl);
      sets.push(`avatar_url = $${params.length}`);
    }
    if (!sets.length) return null;
    const { rows } = await query(
      `UPDATE clans SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, tag, description, avatar_url AS "avatarUrl"`,
      params
    );
    return rows[0] || null;
  },

  async setOwner(clanId, newOwnerId) {
    await query(`UPDATE clans SET owner_id = $2 WHERE id = $1`, [clanId, newOwnerId]);
    await query(`UPDATE clan_members SET role = 'member' WHERE clan_id = $1 AND role = 'leader'`, [clanId]);
    await query(`UPDATE clan_members SET role = 'leader' WHERE clan_id = $1 AND user_id = $2`, [clanId, newOwnerId]);
  },

  async removeMember(clanId, userId) {
    const { rowCount } = await query(`DELETE FROM clan_members WHERE clan_id = $1 AND user_id = $2`, [clanId, userId]);
    return rowCount > 0;
  },

  async memberExists(clanId, userId) {
    const { rows } = await query(`SELECT 1 FROM clan_members WHERE clan_id = $1 AND user_id = $2`, [clanId, userId]);
    return rows.length > 0;
  },

  async findById(clanId) {
    const { rows } = await query(`SELECT id, owner_id AS "ownerId" FROM clans WHERE id = $1`, [clanId]);
    return rows[0] || null;
  },

  async remove(clanId) {
    const { rowCount } = await query(`DELETE FROM clans WHERE id = $1`, [clanId]);
    return rowCount > 0;
  },
};
