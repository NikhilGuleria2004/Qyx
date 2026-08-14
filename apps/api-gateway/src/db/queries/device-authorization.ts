import { D1Database } from '@cloudflare/workers-types';

export async function createAuthorizationRequest(
  db: D1Database,
  id: string,
  pendingDeviceId: string,
  authorizedByDeviceId: string,
  payload: string
) {
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO device_authorization_requests (id, pending_device_id, authorized_by_device_id, payload, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, pendingDeviceId, authorizedByDeviceId, payload, now).run();
  return result;
}

export async function getAuthorizationRequestByPendingDevice(db: D1Database, pendingDeviceId: string) {
  const result = await db.prepare('SELECT * FROM device_authorization_requests WHERE pending_device_id = ? ORDER BY created_at DESC LIMIT 1').bind(pendingDeviceId).first();
  return result;
}

export async function deleteAuthorizationRequest(db: D1Database, requestId: string) {
  const result = await db.prepare('DELETE FROM device_authorization_requests WHERE id = ?').bind(requestId).run();
  return result;
}
