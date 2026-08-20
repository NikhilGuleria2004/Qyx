import { getAccessToken } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';

export interface Device {
  id: string;
  user_id: string;
  organization_id: string;
  device_name: string;
  platform?: string;
  public_key: string;
  signing_key: string;
  status: 'pending' | 'active' | 'revoked';
  created_at: number;
  last_seen_at?: number;
  pairing_code?: string;
}

export interface RegisterDeviceBody {
  device_name: string;
  platform?: 'web' | 'ios' | 'android' | 'desktop';
  public_key: string;
  signing_key: string;
}

export async function listMyDevices(): Promise<Device[]> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/v1/me/devices'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json() as { devices: Device[] };
  return data.devices || [];
}

export async function registerDevice(body: RegisterDeviceBody): Promise<Device> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/v1/me/devices'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<Device>;
}

export async function resolvePairingCode(pairingCode: string): Promise<Device> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/v1/me/devices/resolve-pairing-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pairing_code: pairingCode }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json() as { device: Device };
  return data.device;
}

export async function authorizeDevice(deviceId: string, payload: string): Promise<Device> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(`/v1/me/devices/${deviceId}/authorize`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json() as { device: Device };
  return data.device;
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(`/v1/me/devices/${deviceId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}
