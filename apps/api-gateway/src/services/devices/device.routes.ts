import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { rbac } from '../../middleware/rbac';
import { orgScope } from '../../middleware/orgScope';
import { AuditService } from '../audit/audit.service';
import { DeviceService } from './device.service';
import { RegisterDeviceSchema, AuthorizeDeviceSchema, ResolvePairingCodeSchema } from './device.schema';

type DeviceBindings = {
  PRIMARY_DB: D1Database;
};

type DeviceVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
};

const app = new Hono<{ Bindings: DeviceBindings; Variables: DeviceVariables }>();

app.post('/', auth, orgScope, rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = RegisterDeviceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new DeviceService(c.env.PRIMARY_DB);
  const device = await service.registerDevice(user.user_id, user.organization_id, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'device_registered',
    metadata: { device_id: device.id, platform: device.platform },
  });

  return c.json(device, 201);
});

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:read');
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new DeviceService(c.env.PRIMARY_DB);
  const devices = await service.listDevices(user.user_id, user.organization_id);

  return c.json({ devices });
});

app.post('/resolve-pairing-code', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:read');
  const body = await c.req.json();
  const parsed = ResolvePairingCodeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const user = c.get('user') as { user_id: string; organization_id: string };
  const service = new DeviceService(c.env.PRIMARY_DB);
  const device = await service.getDeviceByPairingCode(parsed.data.pairing_code);

  if (!device) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Invalid or expired pairing code', request_id: crypto.randomUUID() } },
      404
    );
  }

  if (device.user_id !== user.user_id) {
    return c.json(
      { error: { code: 'FORBIDDEN_ROLE', message: 'Device belongs to another user', request_id: crypto.randomUUID() } },
      403
    );
  }

  return c.json({ device });
});

app.post('/:deviceId/authorize', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const deviceId = c.req.param('deviceId');

  if (!deviceId) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Device ID required', request_id: crypto.randomUUID() } },
      400
    );
  }

  const body = await c.req.json();
  const parsed = AuthorizeDeviceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new DeviceService(c.env.PRIMARY_DB);
  const device = await service.getDevice(user.user_id, deviceId);

  if (!device) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Device not found', request_id: crypto.randomUUID() } },
      404
    );
  }

  try {
    const authorized = await service.authorizeDevice(user.user_id, deviceId, parsed.data.payload);

    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: user.organization_id,
      actor_id: user.user_id,
      event_type: 'device_authorized',
      metadata: { device_id: deviceId },
    });

    return c.json({ status: 'authorized', device: authorized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authorization failed';
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message, request_id: crypto.randomUUID() } },
      400
    );
  }
});

app.delete('/:deviceId', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const deviceId = c.req.param('deviceId');

  if (!deviceId) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Device ID required', request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new DeviceService(c.env.PRIMARY_DB);
  const device = await service.getDevice(user.user_id, deviceId);

  if (!device) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Device not found', request_id: crypto.randomUUID() } },
      404
    );
  }

  await service.revokeDevice(user.user_id, deviceId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'device_revoked',
    metadata: { device_id: deviceId },
  });

  return c.json({ status: 'revoked' });
});

export default app;
