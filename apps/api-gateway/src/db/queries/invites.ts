import { D1Database } from '@cloudflare/workers-types';

export async function createInvite(db: D1Database, id: string, organizationId: string, email: string | null, code: string, role: string, expiresAt: number) {
  const now = Date.now();
  await db.prepare(
    'INSERT INTO invites (id, organization_id, email, code, role, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, email, code, role, 'pending', now, expiresAt).run();
}

export async function getInviteByCode(db: D1Database, code: string) {
  const result = await db.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first();
  return result as { id: string; organization_id: string; email: string | null; code: string; role: string; status: string; created_at: number; expires_at: number } | null;
}

export async function getInvitesByEmail(db: D1Database, email: string) {
  const result = await db.prepare('SELECT * FROM invites WHERE email = ? AND status = ? AND expires_at > ?').bind(email, 'pending', Date.now()).all();
  return (result.results || []) as Array<{ id: string; organization_id: string; email: string | null; code: string; role: string; status: string; created_at: number; expires_at: number }>;
}

export async function getInvitesByOrg(db: D1Database, organizationId: string) {
  const result = await db.prepare('SELECT * FROM invites WHERE organization_id = ? ORDER BY created_at DESC').bind(organizationId).all();
  return (result.results || []) as Array<{ id: string; organization_id: string; email: string | null; code: string; role: string; status: string; created_at: number; expires_at: number }>;
}

export async function acceptInvite(db: D1Database, orgId: string, inviteId: string) {
  await db.prepare('UPDATE invites SET status = ? WHERE id = ? AND organization_id = ?').bind('accepted', inviteId, orgId).run();
}

export async function revokeInvite(db: D1Database, orgId: string, inviteId: string) {
  await db.prepare('UPDATE invites SET status = ? WHERE id = ? AND organization_id = ?').bind('revoked', inviteId, orgId).run();
}
