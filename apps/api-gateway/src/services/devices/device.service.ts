import { D1Database } from '@cloudflare/workers-types';
import { getDeviceById, getDevicesByUser, createDevice as dbCreateDevice, updateDeviceStatus } from '../../db/queries/devices';
import { createAuthorizationRequest, getAuthorizationRequestByPendingDevice } from '../../db/queries/device-authorization';
import { deleteDeviceSessions } from '../auth/session';
import { Device } from './device.types';
import { RegisterDevice } from './device.schema';

export class DeviceService {
  constructor(private db: D1Database) {}

  async registerDevice(userId: string, organizationId: string, data: RegisterDevice): Promise<Device> {
    const existing = await getDevicesByUser(this.db, userId, organizationId);
    const deviceList = existing as unknown as Device[];

    for (const device of deviceList) {
      if (device.public_key === data.public_key && device.status !== 'revoked') {
        throw new Error('Device with this public key already registered');
      }
    }

    const deviceId = `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const pairingCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    await dbCreateDevice(this.db, deviceId, userId, organizationId, data.device_name, data.public_key, data.signing_key, data.platform, pairingCode);

    const created = await getDeviceById(this.db, deviceId);
    return created as unknown as Device;
  }

  async listDevices(userId: string, organizationId: string): Promise<Device[]> {
    const devices = await getDevicesByUser(this.db, userId, organizationId);
    return devices as unknown as Device[];
  }

  async listDevicesByOrg(organizationId: string): Promise<Device[]> {
    const result = await this.db.prepare('SELECT * FROM devices WHERE organization_id = ? ORDER BY created_at DESC').bind(organizationId).all();
    return result.results as unknown as Device[];
  }

  async getDeviceByPairingCode(pairingCode: string): Promise<Device | null> {
    const result = await this.db.prepare('SELECT * FROM devices WHERE pairing_code = ? AND status = ?').bind(pairingCode, 'pending').first();
    return result as unknown as Device | null;
  }

  async authorizeDevice(authorizedByUserId: string, pendingDeviceId: string, payload: string): Promise<Device> {
    const pendingDevice = await getDeviceById(this.db, pendingDeviceId);
    const deviceData = pendingDevice as unknown as Device | undefined;

    if (!deviceData) {
      throw new Error('Pending device not found');
    }

    if (deviceData.user_id !== authorizedByUserId) {
      throw new Error('Forbidden: cannot authorize device for another user');
    }

    const existingDevices = await getDevicesByUser(this.db, authorizedByUserId, deviceData.organization_id);
    const deviceList = existingDevices as unknown as Device[];
    const hasTrustedDevice = deviceList.some(d => d.status === 'active');

    if (!hasTrustedDevice) {
      throw new Error('No trusted device found to authorize');
    }

    const requestId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await createAuthorizationRequest(this.db, requestId, pendingDeviceId, '', payload);

    await updateDeviceStatus(this.db, deviceData.organization_id, pendingDeviceId, 'active');

    const updated = await getDeviceById(this.db, pendingDeviceId);
    return updated as unknown as Device;
  }

  async getAuthorizationPayload(pendingDeviceId: string): Promise<{ payload: string; request_id: string } | null> {
    const request = await getAuthorizationRequestByPendingDevice(this.db, pendingDeviceId);
    if (!request) {
      return null;
    }

    const requestData = request as { id: string; payload: string };
    return {
      payload: requestData.payload,
      request_id: requestData.id,
    };
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await getDeviceById(this.db, deviceId);
    const deviceData = device as unknown as Device | undefined;

    if (!deviceData) {
      throw new Error('Device not found');
    }

    if (deviceData.user_id !== userId) {
      throw new Error('Forbidden');
    }

    await updateDeviceStatus(this.db, deviceData.organization_id, deviceId, 'revoked');
    await deleteDeviceSessions(this.db, deviceId);
  }

  async adminRevokeDevice(organizationId: string, deviceId: string): Promise<void> {
    const device = await getDeviceById(this.db, deviceId);
    const deviceData = device as unknown as Device | undefined;

    if (!deviceData) {
      throw new Error('Device not found');
    }

    if (deviceData.organization_id !== organizationId) {
      throw new Error('Forbidden: device belongs to another organization');
    }

    await updateDeviceStatus(this.db, organizationId, deviceId, 'revoked');
    await deleteDeviceSessions(this.db, deviceId);
  }

  async getDevice(userId: string, deviceId: string): Promise<Device | null> {
    const device = await getDeviceById(this.db, deviceId);
    const deviceData = device as unknown as Device | undefined;

    if (!deviceData) {
      return null;
    }

    if (deviceData.user_id !== userId) {
      return null;
    }

    return deviceData;
  }
}
