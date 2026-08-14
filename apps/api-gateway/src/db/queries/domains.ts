import { D1Database } from '@cloudflare/workers-types';

export async function getDomainById(db: D1Database, domainId: string) {
  const result = await db.prepare('SELECT * FROM domains WHERE id = ?').bind(domainId).first();
  return result;
}

export async function getDomainByName(db: D1Database, domain: string) {
  const result = await db.prepare('SELECT * FROM domains WHERE domain = ?').bind(domain).first();
  return result;
}

export async function createDomain(db: D1Database, id: string, organizationId: string, domain: string, verificationToken: string) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO domains (id, organization_id, domain, verified, verification_token, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, organizationId, domain, 0, verificationToken, now).run();
  return result;
}

export async function updateDomainVerification(db: D1Database, domainId: string, verified: boolean) {
  const result = await db.prepare(
    'UPDATE domains SET verified = ? WHERE id = ?'
  ).bind(verified ? 1 : 0, domainId).run();
  return result;
}

export async function listDomainsByOrg(db: D1Database, organizationId: string) {
  const result = await db.prepare('SELECT * FROM domains WHERE organization_id = ?').bind(organizationId).all();
  return result.results;
}
