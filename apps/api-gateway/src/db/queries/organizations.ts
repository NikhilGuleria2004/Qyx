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

export async function updateOrgSecurityPolicy(db: D1Database, orgId: string, data: Record<string, unknown>) {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.recovery_policy !== undefined) {
    sets.push('recovery_policy = ?');
    values.push(data.recovery_policy);
  }
  if (data.mfa_required_roles !== undefined) {
    sets.push('mfa_required_roles = ?');
    values.push(data.mfa_required_roles);
  }
  if (data.allowed_file_types !== undefined) {
    sets.push('allowed_file_types = ?');
    values.push(data.allowed_file_types);
  }
  if (data.max_file_size_mb !== undefined) {
    sets.push('max_file_size_mb = ?');
    values.push(data.max_file_size_mb);
  }
  if (data.external_sharing !== undefined) {
    sets.push('external_sharing = ?');
    values.push(data.external_sharing ? 1 : 0);
  }
  if (data.notification_preview !== undefined) {
    sets.push('notification_preview = ?');
    values.push(data.notification_preview ? 1 : 0);
  }

  if (sets.length === 0) return;

  values.push(orgId);
  await db.prepare(`UPDATE org_security_policy SET ${sets.join(', ')} WHERE organization_id = ?`).bind(...values).run();
}
