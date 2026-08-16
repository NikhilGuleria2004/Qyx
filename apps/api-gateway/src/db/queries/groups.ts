import { D1Database } from '@cloudflare/workers-types';

export async function getGroupById(db: D1Database, groupId: string) {
  const result = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
  return result;
}

export async function getGroupsByOrg(db: D1Database, organizationId: string) {
  const result = await db.prepare('SELECT * FROM groups WHERE organization_id = ?').bind(organizationId).all();
  return result.results;
}

export async function createGroup(
  db: D1Database,
  id: string,
  organizationId: string,
  name: string,
  description: string | null,
  createdBy: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO groups (id, organization_id, name, description, created_by, key_epoch, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, name, description, createdBy, 1, now).run();
  return result;
}

export async function deleteGroup(db: D1Database, groupId: string) {
  const result = await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
  return result;
}
