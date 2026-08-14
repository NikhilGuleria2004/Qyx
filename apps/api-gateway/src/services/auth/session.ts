import { D1Database } from '@cloudflare/workers-types';

export async function createSession(db: D1Database, userId: string, organizationId: string, refreshToken: string, deviceId?: string): Promise<string> {
  const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();
  const expiresAt = now + (7 * 24 * 60 * 60 * 1000);
  
  await db.prepare(
    'INSERT INTO sessions (id, user_id, organization_id, device_id, refresh_token, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(sessionId, userId, organizationId, deviceId || null, refreshToken, expiresAt, now, now).run();
  
  return sessionId;
}

export async function getSessionByRefreshToken(db: D1Database, refreshToken: string) {
  const result = await db.prepare('SELECT * FROM sessions WHERE refresh_token = ?').bind(refreshToken).first();
  return result;
}

export async function deleteSession(db: D1Database, refreshToken: string) {
  await db.prepare('DELETE FROM sessions WHERE refresh_token = ?').bind(refreshToken).run();
}

export async function deleteUserSessions(db: D1Database, userId: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export async function updateSessionLastSeen(db: D1Database, sessionId: string) {
  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(Date.now(), sessionId).run();
}
