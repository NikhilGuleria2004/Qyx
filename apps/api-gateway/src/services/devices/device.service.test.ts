import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceService } from './device.service';

describe('DeviceService', () => {
  let db: D1Database;
  let service: DeviceService;
  let devices: Record<string, unknown>[];
  let sessions: Record<string, unknown>[];
  let authorizationRequests: Record<string, unknown>[];

  beforeEach(() => {
    devices = [];
    sessions = [];
    authorizationRequests = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM devices WHERE id = ?')) {
              return devices.find((d) => d.id === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM devices WHERE pairing_code = ?')) {
              return devices.find((d) => d.pairing_code === args[0] && d.status === args[1]) || null;
            }
            if (sql.includes('SELECT * FROM device_authorization_requests')) {
              return authorizationRequests
                .filter((r) => r.pending_device_id === args[0])
                .sort((a, b) => (b.created_at as number) - (a.created_at as number))[0] || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM devices WHERE user_id = ? AND organization_id = ?')) {
              return { results: devices.filter((d) => d.user_id === args[0] && d.organization_id === args[1]) };
            }
            if (sql.includes('SELECT * FROM devices WHERE organization_id = ?')) {
              return { results: devices.filter((d) => d.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO devices')) {
              devices.push({
                id: args[0] as string,
                user_id: args[1] as string,
                organization_id: args[2] as string,
                device_name: args[3] as string,
                platform: args[4] as string | null,
                public_key: args[5] as string,
                signing_key: args[6] as string,
                status: args[7] as string,
                created_at: args[8] as number,
                last_seen_at: args[9] as number | null,
                pairing_code: args[10] as string | null,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE devices SET status')) {
              const idx = devices.findIndex((d) => d.id === args[1] && d.organization_id === args[2]);
              if (idx !== -1) {
                devices[idx] = { ...devices[idx], status: args[0] as string };
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            if (sql.includes('DELETE FROM devices')) {
              const idx = devices.findIndex((d) => d.id === args[0] && d.organization_id === args[1]);
              if (idx !== -1) {
                devices.splice(idx, 1);
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            if (sql.includes('INSERT INTO sessions')) {
              sessions.push({
                id: args[0] as string,
                user_id: args[1] as string,
                organization_id: args[2] as string,
                device_id: args[3] as string | null,
                refresh_token: args[4] as string,
                expires_at: args[5] as number,
                created_at: args[6] as number,
                last_seen_at: args[7] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('DELETE FROM sessions WHERE device_id = ?')) {
              const before = sessions.length;
              sessions = sessions.filter((s) => s.device_id !== args[0]);
              return { changes: before - sessions.length };
            }
            if (sql.includes('DELETE FROM sessions WHERE user_id = ?')) {
              const before = sessions.length;
              sessions = sessions.filter((s) => s.user_id !== args[0]);
              return { changes: before - sessions.length };
            }
            if (sql.includes('INSERT INTO device_authorization_requests')) {
              authorizationRequests.push({
                id: args[0] as string,
                pending_device_id: args[1] as string,
                authorized_by_device_id: args[2] as string,
                payload: args[3] as string,
                created_at: args[4] as number,
              });
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new DeviceService(db);
  });

  it('registers a new device with pending status', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'MacBook Pro',
      platform: 'web',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    expect(device.id.startsWith('dev_')).toBe(true);
    expect(device.user_id).toBe('usr_123');
    expect(device.organization_id).toBe('org_123');
    expect(device.device_name).toBe('MacBook Pro');
    expect(device.status).toBe('pending');
    expect(devices.length).toBe(1);
  });

  it('rejects duplicate public key registration', async () => {
    await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device 1',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await expect(
      service.registerDevice('usr_123', 'org_123', {
        device_name: 'Device 2',
        public_key: 'dGVzdA==',
        signing_key: 'cmVzaWdu',
      })
    ).rejects.toThrow('Device with this public key already registered');
  });

  it('allows same public key if previous device was revoked', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Old Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await service.revokeDevice('usr_123', device.id);

    const newDevice = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'New Device',
      public_key: 'dGVzdA==',
      signing_key: 'cmVzaWdu',
    });

    expect(newDevice.id).not.toBe(device.id);
  });

  it('lists devices scoped to user and org', async () => {
    await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device 1',
      public_key: 'a2V5MQ==',
      signing_key: 'c2lnMQ==',
    });
    await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device 2',
      public_key: 'a2V5Mg==',
      signing_key: 'c2lnMg==',
    });
    await service.registerDevice('usr_456', 'org_123', {
      device_name: 'Other User Device',
      public_key: 'a2V5Mw==',
      signing_key: 'c2lnMw==',
    });

    const userDevices = await service.listDevices('usr_123', 'org_123');
    expect(userDevices.length).toBe(2);
    userDevices.forEach((d) => {
      expect(d.user_id).toBe('usr_123');
      expect(d.organization_id).toBe('org_123');
    });
  });

  it('lists devices by organization', async () => {
    await service.registerDevice('usr_1', 'org_123', {
      device_name: 'D1',
      public_key: 'a2V5MQ==',
      signing_key: 'c2lnMQ==',
    });
    await service.registerDevice('usr_2', 'org_456', {
      device_name: 'D2',
      public_key: 'a2V5Mg==',
      signing_key: 'c2lnMg==',
    });

    const orgDevices = await service.listDevicesByOrg('org_123');
    expect(orgDevices.length).toBe(1);
    expect(orgDevices[0].organization_id).toBe('org_123');
  });

  it('finds device by pairing code', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Test Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    const found = await service.getDeviceByPairingCode(device.pairing_code!);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(device.id);
  });

  it('does not find device by pairing code if not pending', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Test Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await service.revokeDevice('usr_123', device.id);

    const found = await service.getDeviceByPairingCode(device.pairing_code!);
    expect(found).toBeNull();
  });

  it('authorizes a device', async () => {
    const existingDevice = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Trusted Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    const existingIdx = devices.findIndex((d) => d.id === existingDevice.id);
    devices[existingIdx] = { ...devices[existingIdx], status: 'active' };

    const pendingDevice = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'New Device',
      public_key: 'bmV3a2V5',
      signing_key: 'bmV3c2ln',
    });

    const authorized = await service.authorizeDevice('usr_123', pendingDevice.id, 'auth_payload');
    expect(authorized.status).toBe('active');
  });

  it('rejects authorizing device for another user', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await expect(
      service.authorizeDevice('usr_456', device.id, 'payload')
    ).rejects.toThrow('Forbidden: cannot authorize device for another user');
  });

  it('rejects authorizing when no trusted device exists', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Only Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await expect(
      service.authorizeDevice('usr_123', device.id, 'payload')
    ).rejects.toThrow('No trusted device found to authorize');
  });

  it('revokes a device and invalidates its sessions', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    sessions.push(
      { id: 'sess_1', user_id: 'usr_123', device_id: device.id, refresh_token: 'rt_1' },
      { id: 'sess_2', user_id: 'usr_123', device_id: device.id, refresh_token: 'rt_2' },
      { id: 'sess_3', user_id: 'usr_123', device_id: 'other_device', refresh_token: 'rt_3' }
    );

    await service.revokeDevice('usr_123', device.id);

    const revokedDevice = devices.find((d) => d.id === device.id);
    expect(revokedDevice!.status).toBe('revoked');

    const deviceSessions = sessions.filter((s) => s.device_id === device.id);
    expect(deviceSessions.length).toBe(0);
    expect(sessions.length).toBe(1);
    expect(sessions[0].device_id).toBe('other_device');
  });

  it('prevents revoking another user\'s device', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await expect(
      service.revokeDevice('usr_456', device.id)
    ).rejects.toThrow('Forbidden');
  });

  it('admin revokes device across org', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    sessions.push(
      { id: 'sess_1', user_id: 'usr_123', device_id: device.id, refresh_token: 'rt_1' }
    );

    await service.adminRevokeDevice('org_123', device.id);

    const revokedDevice = devices.find((d) => d.id === device.id);
    expect(revokedDevice!.status).toBe('revoked');
    expect(sessions.length).toBe(0);
  });

  it('admin cannot revoke device from another org', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    await expect(
      service.adminRevokeDevice('org_456', device.id)
    ).rejects.toThrow('Forbidden: device belongs to another organization');
  });

  it('gets device only if owned by user', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    const owned = await service.getDevice('usr_123', device.id);
    expect(owned).not.toBeNull();
    expect(owned!.id).toBe(device.id);

    const notOwned = await service.getDevice('usr_456', device.id);
    expect(notOwned).toBeNull();
  });

  it('returns null when getting non-existent device', async () => {
    const result = await service.getDevice('usr_123', 'dev_nonexistent');
    expect(result).toBeNull();
  });

  it('gets authorization payload', async () => {
    const device = await service.registerDevice('usr_123', 'org_123', {
      device_name: 'Device',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });

    const deviceIdx = devices.findIndex((d) => d.id === device.id);
    devices[deviceIdx] = { ...devices[deviceIdx], status: 'active' };

    await service.authorizeDevice('usr_123', device.id, 'test_payload');

    const payload = await service.getAuthorizationPayload(device.id);
    expect(payload).not.toBeNull();
    expect(payload!.payload).toBe('test_payload');
  });
});
