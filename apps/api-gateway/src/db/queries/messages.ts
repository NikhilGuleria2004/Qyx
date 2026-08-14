import { D1Database } from '@cloudflare/workers-types';

export async function getMessagesByConversation(db: D1Database, conversationId: string, organizationId: string, limit = 50, beforeCreatedAt?: number) {
  let query = 'SELECT * FROM messages WHERE conversation_id = ? AND organization_id = ?';
  const params: unknown[] = [conversationId, organizationId];

  if (beforeCreatedAt) {
    query += ' AND created_at < ?';
    params.push(beforeCreatedAt);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await db.prepare(query).bind(...params).all();
  return result.results;
}

export async function getMessageById(db: D1Database, messageId: string) {
  const result = await db.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first();
  return result;
}

export async function createMessage(
  db: D1Database,
  id: string,
  organizationId: string,
  conversationId: string,
  senderId: string,
  ciphertext: Uint8Array,
  messageType: string,
  attachmentRef?: string,
  replyTo?: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO messages (id, organization_id, conversation_id, sender_id, ciphertext, message_type, attachment_ref, reply_to, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    organizationId,
    conversationId,
    senderId,
    ciphertext,
    messageType,
    attachmentRef || null,
    replyTo || null,
    'sent',
    now
  ).run();
  return result;
}

export async function updateMessageStatus(db: D1Database, messageId: string, status: string) {
  const result = await db.prepare('UPDATE messages SET status = ? WHERE id = ?').bind(status, messageId).run();
  return result;
}
