import { D1Database } from '@cloudflare/workers-types';

export async function getFileById(db: D1Database, fileId: string) {
  const result = await db.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();
  return result;
}

export async function getFilesByOrg(db: D1Database, organizationId: string) {
  const result = await db.prepare('SELECT * FROM files WHERE organization_id = ?').bind(organizationId).all();
  return result.results;
}

export async function createFile(
  db: D1Database,
  id: string,
  organizationId: string,
  uploaderId: string,
  encryptedStorageReference: string,
  mimeType: string,
  sizeBytes: number,
  conversationId?: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO files (id, organization_id, uploader_id, encrypted_storage_reference, mime_type, size_bytes, status, created_at, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, uploaderId, encryptedStorageReference, mimeType, sizeBytes, 'pending', now, conversationId || null).run();
  return result;
}

export async function updateFileStatus(db: D1Database, orgId: string, fileId: string, status: string) {
  const result = await db.prepare('UPDATE files SET status = ? WHERE id = ? AND organization_id = ?').bind(status, fileId, orgId).run();
  return result;
}

export async function deleteFile(db: D1Database, fileId: string, orgId?: string) {
  const query = orgId ? 'DELETE FROM files WHERE id = ? AND organization_id = ?' : 'DELETE FROM files WHERE id = ?';
  const params = orgId ? [fileId, orgId] : [fileId];
  const result = await db.prepare(query).bind(...params).run();
  return result;
}

export async function getOrphanedFiles(db: D1Database, olderThan: number) {
  const result = await db.prepare('SELECT * FROM files WHERE status = ? AND created_at < ?').bind('pending', olderThan).all();
  return result.results;
}
