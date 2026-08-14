import { Hono } from 'hono';
import { auth, requireSuperAdmin } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { AuditService } from '../audit/audit.service';
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
};

const app = new Hono<{ Bindings: OrgBindings; Variables: OrgVariables }>();

app.post('/', auth, requireSuperAdmin, async (c) => {
  const user = c.get('user') as { organization_id: string; user_id: string };
  const body = await c.req.json();
  const parsed = CreateOrganizationSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
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
      { error: { code: 'NOT_FOUND', message: 'Organization not found', request_id: crypto.randomUUID() } },
      404
    );
  }

  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:read');
  return c.json(org);
});

app.post('/:orgId/domains', auth, orgScope, rbac, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const body = (c as unknown as { get: (key: string) => unknown }).get('validatedBody') as { domain: string };
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  
  const parsed = AddDomainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
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

app.post('/:orgId/domains/:domainId/verify', auth, orgScope, rbac, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const body = (c as unknown as { get: (key: string) => unknown }).get('validatedBody') as { txt_record: string };
  const orgId = c.req.param('orgId')!;
  const domainId = c.req.param('domainId')!;
  const user = c.get('user') as { user_id: string };
  
  const parsed = VerifyDomainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
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

app.patch('/:orgId/settings', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = UpdateOrgSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
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

export default app;
