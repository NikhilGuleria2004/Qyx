import { Hono } from 'hono';
import { auth, requireSuperAdmin } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import alertsRoutes from '../alerts/alerts.routes';
import { OrganizationService } from './organization.service';
import { CreateOrganizationSchema, AddDomainSchema, VerifyDomainSchema, UpdateOrgSettingsSchema } from './organization.schema';
import membersRoutes from './members.routes';

type OrgBindings = {
  PRIMARY_DB: D1Database;
};

type OrgVariables = {
  permission?: string;
  validatedBody?: Record<string, unknown>;
  user?: { organization_id: string; user_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: OrgBindings; Variables: OrgVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.post('/', auth, requireSuperAdmin, async (c) => {
  const user = c.get('user') as { organization_id: string; user_id: string };
  const body = await c.req.json();
  const parsed = CreateOrganizationSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new OrganizationService(c.env.PRIMARY_DB);
  const org = await service.createOrganization(parsed.data, user.organization_id);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: org.id,
    actor_id: user.user_id,
    event_type: 'org_created',
    metadata: { org_name: org.name },
  });
  
  return c.json(org, 201);
});

app.get('/:orgId', auth, orgScope, rbac, async (c) => {
  const orgId = c.req.param('orgId')!;
  const service = new OrganizationService(c.env.PRIMARY_DB);
  const org = await service.getOrganization(orgId);
  
  if (!org) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Organization not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:read');
  return c.json(org);
});

app.post('/:orgId/domains', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const body = (c as unknown as { get: (key: string) => unknown }).get('validatedBody') as { domain: string };
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  
  const parsed = AddDomainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new OrganizationService(c.env.PRIMARY_DB);
  const domain = await service.addDomain(orgId, parsed.data);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'domain_added',
    metadata: { domain: parsed.data.domain },
  });
  
  return c.json(domain, 201);
});

app.get('/:orgId/domains', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:read');
  const orgId = c.req.param('orgId')!;
  const service = new OrganizationService(c.env.PRIMARY_DB);
  const domains = await service.listDomains(orgId);
  const safeDomains = domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    verified: !!d.verified,
    verification_token: d.verification_token,
    created_at: d.created_at,
  }));
  return c.json({ domains: safeDomains });
});

app.post('/:orgId/domains/:domainId/verify', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const body = (c as unknown as { get: (key: string) => unknown }).get('validatedBody') as { txt_record: string };
  const orgId = c.req.param('orgId')!;
  const domainId = c.req.param('domainId')!;
  const user = c.get('user') as { user_id: string };
  
  const parsed = VerifyDomainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new OrganizationService(c.env.PRIMARY_DB);
  const domain = await service.verifyDomain(orgId, domainId, parsed.data.txt_record);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'domain_verified',
    metadata: { domain_id: domainId, verified: domain.verified },
  });
  
  return c.json(domain);
});

app.get('/:orgId/settings', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:read');
  const orgId = c.req.param('orgId')!;
  
  const policy = await c.env.PRIMARY_DB.prepare('SELECT * FROM org_security_policy WHERE organization_id = ?').bind(orgId).first();
  
  return c.json({ org_id: orgId, policy });
});

app.get('/:orgId/security-summary', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:read');
  const orgId = c.req.param('orgId')!;

  const totalUsersResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ?').bind(orgId).first();
  const totalUsers = (totalUsersResult as { count: number }).count || 0;

  const mfaEnabledResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND mfa_enabled = 1').bind(orgId).first();
  const mfaEnabledCount = (mfaEnabledResult as { count: number }).count || 0;
  const mfaAdoptionPct = totalUsers > 0 ? Math.round((mfaEnabledCount / totalUsers) * 100) : 0;

  const suspendedResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND status = ?').bind(orgId, 'suspended').first();
  const suspendedCount = (suspendedResult as { count: number }).count || 0;

  const totalDevicesResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ?').bind(orgId).first();
  const totalDevices = (totalDevicesResult as { count: number }).count || 0;

  const activeDevicesResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ? AND status = ?').bind(orgId, 'active').first();
  const activeDevicesCount = (activeDevicesResult as { count: number }).count || 0;
  const deviceVerificationPct = totalDevices > 0 ? Math.round((activeDevicesCount / totalDevices) * 100) : 0;

  const pendingDevicesResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ? AND status = ?').bind(orgId, 'pending').first();
  const pendingDevicesCount = (pendingDevicesResult as { count: number }).count || 0;

  const activeSessionsResult = await c.env.PRIMARY_DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE organization_id = ? AND expires_at > ?').bind(orgId, Date.now()).first();
  const activeSessionsCount = (activeSessionsResult as { count: number }).count || 0;

  return c.json({
    org_id: orgId,
    mfa_adoption: {
      total: totalUsers,
      enabled: mfaEnabledCount,
      percentage: mfaAdoptionPct,
    },
    device_verification: {
      total: totalDevices,
      active: activeDevicesCount,
      pending: pendingDevicesCount,
      percentage: deviceVerificationPct,
    },
    suspended_accounts: suspendedCount,
    active_sessions: activeSessionsCount,
    unrecognized_devices: pendingDevicesCount,
  });
});

app.get('/:orgId/metrics', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'security:read');
  const orgId = c.req.param('orgId')!;
  const type = c.req.query('type') || 'security';

  const { MetricsService } = await import('../metrics/metrics.service');
  const metricsService = new MetricsService(c.env.PRIMARY_DB);

  if (type === 'golden') {
    const signals = await metricsService.getAllGoldenSignals(5);
    return c.json({ metrics: signals });
  }

  if (type === 'do') {
    const doName = c.req.query('do') || 'ConversationDO';
    const doMetrics = await metricsService.getDoMetrics(doName);
    return c.json({ metrics: doMetrics });
  }

  if (type === 'queue') {
    const queueName = c.req.query('queue') || 'offline-delivery';
    const queueMetrics = await metricsService.getQueueMetrics(queueName);
    return c.json({ metrics: queueMetrics });
  }

  if (type === 'd1') {
    const d1Metrics = await metricsService.getD1Metrics();
    return c.json({ metrics: d1Metrics });
  }

  if (type === 'r2') {
    const r2Op = c.req.query('operation') || 'upload';
    const r2Metrics = await metricsService.getR2Metrics(r2Op as 'upload' | 'download');
    return c.json({ metrics: r2Metrics });
  }

  const securityMetrics = await metricsService.getSecurityMetrics(orgId);
  return c.json({ metrics: securityMetrics });
});

app.get('/:orgId/audit', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'audit:read');
  const orgId = c.req.param('orgId')!;
  const eventType = c.req.query('event_type');
  const actorId = c.req.query('actor_id');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

  const { AuditService } = await import('../audit/audit.service');
  const auditService = new AuditService(c.env.PRIMARY_DB);
  const result = await auditService.listByOrg(orgId, {
    eventType: eventType || undefined,
    actorId: actorId || undefined,
    limit,
    cursor: cursor ? parseInt(cursor, 10) : undefined,
  });

  return c.json({
    events: result.events,
    next_cursor: result.nextCursor,
  });
});

app.get('/:orgId/devices', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:read');
  const orgId = c.req.param('orgId')!;

  const { DeviceService } = await import('../devices/device.service');
  const deviceService = new DeviceService(c.env.PRIMARY_DB);
  const devices = await deviceService.listDevicesByOrg(orgId);

  const safeDevices = devices.map((d) => ({
    id: d.id,
    user_id: d.user_id,
    organization_id: d.organization_id,
    device_name: d.device_name,
    platform: d.platform,
    status: d.status,
    created_at: d.created_at,
    last_seen_at: d.last_seen_at,
  }));

  return c.json({ devices: safeDevices });
});

app.post('/:orgId/devices/:deviceId/revoke', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:write');
  const orgId = c.req.param('orgId')!;
  const deviceId = c.req.param('deviceId')!;
  const user = c.get('user') as { user_id: string; organization_id: string };

  const { DeviceService } = await import('../devices/device.service');
  const deviceService = new DeviceService(c.env.PRIMARY_DB);

  try {
    await deviceService.adminRevokeDevice(orgId, deviceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revoke device';
    return c.json(
      { error: { code: 'NOT_FOUND', message, request_id: c.get('requestId') as string } },
      404
    );
  }

  const { AuditService } = await import('../audit/audit.service');
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'device_revoked',
    metadata: { device_id: deviceId },
  });

  return c.json({ status: 'revoked' });
});

app.get('/:orgId/sessions', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:read');
  const orgId = c.req.param('orgId')!;

  const sessions = await c.env.PRIMARY_DB.prepare(
    'SELECT id, user_id, organization_id, device_id, expires_at, created_at, last_seen_at FROM sessions WHERE organization_id = ? ORDER BY last_seen_at DESC'
  ).bind(orgId).all();

  return c.json({ sessions: sessions.results });
});

app.post('/:orgId/sessions/:sessionId/revoke', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'devices:write');
  const orgId = c.req.param('orgId')!;
  const sessionId = c.req.param('sessionId')!;
  const user = c.get('user') as { user_id: string; organization_id: string };

  const session = await c.env.PRIMARY_DB.prepare('SELECT * FROM sessions WHERE id = ? AND organization_id = ?').bind(sessionId, orgId).first();

  if (!session) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Session not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  await c.env.PRIMARY_DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();

  const { AuditService } = await import('../audit/audit.service');
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'session_revoked',
    metadata: { session_id: sessionId },
  });

  return c.json({ status: 'revoked' });
});

app.patch('/:orgId/settings', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = UpdateOrgSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new OrganizationService(c.env.PRIMARY_DB);
  await service.updateSettings(orgId, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'org_settings_updated',
    metadata: parsed.data,
  });

  const policy = await c.env.PRIMARY_DB.prepare('SELECT * FROM org_security_policy WHERE organization_id = ?').bind(orgId).first();
  return c.json({ org_id: orgId, policy });
});

app.route('/:orgId/members', membersRoutes);
app.route('/:orgId/alerts', alertsRoutes);

export default app;
