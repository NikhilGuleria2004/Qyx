import { D1Database } from '@cloudflare/workers-types';

export async function getOrganizationById(db: D1Database, orgId: string) {
  const result = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first();
  return result;
}

export async function getOrganizationByName(db: D1Database, name: string) {
  const result = await db.prepare('SELECT * FROM organizations WHERE name = ?').bind(name).first();
  return result;
}

export async function createOrganization(db: D1Database, id: string, name: string, securityTier: string = 'standard') {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO organizations (id, name, status, security_tier, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, name, 'active', securityTier, now).run();
  
  await db.prepare(
    'INSERT INTO org_security_policy (organization_id, mfa_required_roles, allowed_file_types, max_file_size_mb, external_sharing, notification_preview, recovery_policy) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, 'super_admin,admin', 'pdf,docx,xlsx,pptx,png,jpg,mp4', 500, 0, 0, 'device_only').run();
  
  return result;
}
