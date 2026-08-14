import { D1Database } from '@cloudflare/workers-types';

export async function getConversationById(db: D1Database, conversationId: string) {
  const result = await db.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first();
  return result;
}

export async function getDirectConversation(db: D1Database, organizationId: string, userIdA: string, userIdB: string) {
  const result = await db.prepare(
    `SELECT c.* FROM conversations c
     JOIN conversation_members cm1 ON c.id = cm1.conversation_id
     JOIN conversation_members cm2 ON c.id = cm2.conversation_id
     WHERE c.organization_id = ? AND c.type = 'direct'
     AND cm1.user_id = ? AND cm2.user_id = ?
     AND cm1.removed_at IS NULL AND cm2.removed_at IS NULL
     LIMIT 1`
  ).bind(organizationId, userIdA, userIdB).first();
  return result;
}

export async function createConversation(db: D1Database, id: string, organizationId: string, type: 'direct' | 'group', groupId?: string) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO conversations (id, organization_id, type, group_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, organizationId, type, groupId || null, now).run();
  return result;
}

export async function addConversationMember(db: D1Database, conversationId: string, userId: string, role: string = 'member') {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, removed_at) VALUES (?, ?, ?, ?, NULL)'
  ).bind(conversationId, userId, role, now).run();
  return result;
}

export async function getConversationsByUser(db: D1Database, userId: string, organizationId: string) {
  const result = await db.prepare(
    `SELECT c.* FROM conversations c
     JOIN conversation_members cm ON c.id = cm.conversation_id
     WHERE cm.user_id = ? AND c.organization_id = ?
     AND cm.removed_at IS NULL
     ORDER BY c.created_at DESC`
  ).bind(userId, organizationId).all();
  return result.results;
}

export async function getConversationMembers(db: D1Database, conversationId: string) {
  const result = await db.prepare(
    'SELECT * FROM conversation_members WHERE conversation_id = ? AND removed_at IS NULL'
  ).bind(conversationId).all();
  return result.results;
}
