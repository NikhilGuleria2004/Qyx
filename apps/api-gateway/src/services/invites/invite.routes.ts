import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { InviteService } from './invite.service';

type InviteBindings = {
  PRIMARY_DB: D1Database;
};

type InviteVariables = {
  permission?: string;
  user?: { organization_id: string; user_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: InviteBindings; Variables: InviteVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.post('/:orgId/invites', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string; organization_id: string; role: string };
  const body = await c.req.json<{ email?: string; role?: string; ttl_days?: number }>();

  const email = body.email || null;
  const role = body.role || 'employee';
  const ttlDays = body.ttl_days || 7;

  const service = new InviteService(c.env.PRIMARY_DB);
  const invite = await service.createInvite(orgId, email, role, ttlDays);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'invite_created',
    metadata: { invite_id: invite.id, email, role },
  });

  return c.json(invite, 201);
});

app.get('/:orgId/invites', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:read');
  const orgId = c.req.param('orgId')!;

  const service = new InviteService(c.env.PRIMARY_DB);
  const invites = await service.getInvitesByOrg(orgId);

  const safeInvites = invites.map((inv) => ({
    id: inv.id,
    organization_id: inv.organization_id,
    email: inv.email,
    code: inv.code,
    role: inv.role,
    status: inv.status,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  }));

  return c.json({ invites: safeInvites });
});

app.get('/lookup', async (c) => {
  const domain = c.req.query('domain');
  const email = c.req.query('email');

  if (!domain && !email) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'domain or email query parameter is required', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new InviteService(c.env.PRIMARY_DB);
  let invites;

  if (domain) {
    const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const domainRows = await c.env.PRIMARY_DB.prepare(
      'SELECT organization_id FROM domains WHERE domain = ? AND verified = 1'
    ).bind(normalizedDomain).all();

    const orgIds = ((domainRows.results || []) as Array<{ organization_id: string }>).map((r) => r.organization_id);
    invites = [];
    for (const orgId of orgIds) {
      const orgInvites = await service.getInvitesByOrg(orgId);
      invites.push(...orgInvites.filter((inv) => inv.status === 'pending' && inv.expires_at > Date.now() && !inv.email));
    }
  } else {
    invites = await service.getInvitesByEmail(email as string);
  }

  const orgIds = [...new Set(invites.map((inv) => inv.organization_id))];
  const orgNames: Record<string, string> = {};
  for (const orgId of orgIds) {
    const org = await c.env.PRIMARY_DB.prepare('SELECT name FROM organizations WHERE id = ?').bind(orgId).first();
    if (org) orgNames[orgId] = (org as { name: string }).name;
  }

  const safeInvites = invites.map((inv) => ({
    id: inv.id,
    organization_id: inv.organization_id,
    org_name: orgNames[inv.organization_id] || null,
    email: inv.email,
    code: inv.code,
    role: inv.role,
    status: inv.status,
    expires_at: inv.expires_at,
  }));

  return c.json({ invites: safeInvites });
});

app.post('/accept', async (c) => {
  const body = await c.req.json<{ code: string }>();
  const code = (body.code || '').trim().toUpperCase();

  if (!code) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invite code is required', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new InviteService(c.env.PRIMARY_DB);
  const invite = await service.getInviteByCode(code);

  if (!invite) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Invite not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  if (invite.status !== 'pending') {
    return c.json(
      { error: { code: 'INVALID_STATE', message: 'Invite has already been used', request_id: c.get('requestId') as string } },
      400
    );
  }

  if (invite.expires_at < Date.now()) {
    return c.json(
      { error: { code: 'EXPIRED', message: 'Invite has expired', request_id: c.get('requestId') as string } },
      400
    );
  }

  return c.json({
    organization_id: invite.organization_id,
    invite_id: invite.id,
    role: invite.role,
  });
});

app.post('/:inviteId/revoke', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'org:update');
  const inviteId = c.req.param('inviteId')!;
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new InviteService(c.env.PRIMARY_DB);
  await service.revokeInvite(inviteId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'invite_revoked',
    metadata: { invite_id: inviteId },
  });

  return c.json({ status: 'revoked' });
});

export default app;
