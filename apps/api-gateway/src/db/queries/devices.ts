import { D1Database } from '@cloudflare/workers-types';

export async function getDeviceById(db: D1Database, deviceId: string) {
  const result = await db.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first();
  return result;
}

export async function getDevicesByUser(db: D1Database, userId: string, organizationId: string) {
  const result = await db.prepare('SELECT * FROM devices WHERE user_id = ? AND organization_id = ?').bind(userId, organizationId).all();
  return result.results;
}

export async function createDevice(
  db: D1Database,
  id: string,
  userId: string,
  organizationId: string,
  deviceName: string,
  publicKey: string,
  signingKey: string,
  platform?: string,
  pairingCode?: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO devices (id, user_id, organization_id, device_name, platform, public_key, signing_key, status, created_at, last_seen_at, pairing_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, organizationId, deviceName, platform || null, publicKey, signingKey, 'pending', now, null, pairingCode || null).run();
  return result;
}

export async function updateDeviceStatus(db: D1Database, orgId: string, deviceId: string, status: string) {
  const result = await db.prepare('UPDATE devices SET status = ? WHERE id = ? AND organization_id = ?').bind(status, deviceId, orgId).run();
  return result;
}

export async function deleteDevice(db: D1Database, orgId: string, deviceId: string) {
  const result = await db.prepare('DELETE FROM devices WHERE id = ? AND organization_id = ?').bind(deviceId, orgId).run();
  return result;
}
