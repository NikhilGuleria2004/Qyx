import { D1Database } from '@cloudflare/workers-types';

export async function getGroupMember(db: D1Database, groupId: string, userId: string) {
  const result = await db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).first();
  return result;
}

export async function getGroupMembers(db: D1Database, groupId: string, status?: string) {
  if (status) {
    const result = await db.prepare('SELECT * FROM group_members WHERE group_id = ? AND status = ?').bind(groupId, status).all();
    return result.results;
  }
  const result = await db.prepare('SELECT * FROM group_members WHERE group_id = ?').bind(groupId).all();
  return result.results;
}

export async function createGroupMember(db: D1Database, groupId: string, userId: string, role: string = 'member', status: string = 'pending') {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO group_members (group_id, user_id, role, status, joined_at, requested_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(groupId, userId, role, status, status === 'active' ? now : null, now).run();
  return result;
}

export async function updateGroupMemberStatus(db: D1Database, groupId: string, userId: string, status: string) {
  const now = Date.now();
  const result = await db.prepare('UPDATE group_members SET status = ?, joined_at = ? WHERE group_id = ? AND user_id = ?').bind(status, now, groupId, userId).run();
  return result;
}

export async function deleteGroupMember(db: D1Database, groupId: string, userId: string) {
  const result = await db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).run();
  return result;
}

export async function incrementGroupKeyEpoch(db: D1Database, groupId: string) {
  const result = await db.prepare('UPDATE groups SET key_epoch = key_epoch + 1 WHERE id = ?').bind(groupId).run();
  return result;
}
