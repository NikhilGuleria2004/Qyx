import { D1Database } from '@cloudflare/workers-types';

export async function getUserById(db: D1Database, userId: string) {
  const result = await db.prepare('SELECT id, organization_id, email, display_name, role, status, public_key, created_at, last_active_at FROM users WHERE id = ?').bind(userId).first();
  return result;
}

export async function getUserByEmail(db: D1Database, organizationId: string, email: string) {
  if (organizationId) {
    const result = await db.prepare('SELECT * FROM users WHERE organization_id = ? AND email = ?').bind(organizationId, email).first();
    return result;
  }
  const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  return result;
}

export async function listUsersByOrg(db: D1Database, organizationId: string, status?: string) {
  if (status) {
    const result = await db.prepare('SELECT * FROM users WHERE organization_id = ? AND status = ?').bind(organizationId, status).all();
    return result.results;
  }
  const result = await db.prepare('SELECT * FROM users WHERE organization_id = ?').bind(organizationId).all();
  return result.results;
}

export async function createUser(db: D1Database, id: string, organizationId: string, email: string, displayName: string, role: string, publicKey?: string, passwordHash?: string) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO users (id, organization_id, email, display_name, role, status, public_key, password_hash, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, email, displayName, role, 'active', publicKey || null, passwordHash || null, now, now).run();
  return result;
}

export async function updateUserRole(db: D1Database, userId: string, role: string) {
  const result = await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userId).run();
  return result;
}

export async function updateUserStatus(db: D1Database, userId: string, status: string) {
  const result = await db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();
  return result;
}
