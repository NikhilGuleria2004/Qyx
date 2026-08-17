import { Hono } from 'hono';
import { UserService } from '../users/user.service';
import { CreateUserSchema, UpdateUserRoleSchema, UpdateUserStatusSchema } from '../users/user.schema';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';

type MembersBindings = {
  PRIMARY_DB: D1Database;
};

type MembersVariables = {
  permission?: string;
  validatedBody?: Record<string, unknown>;
  user?: { organization_id: string; user_id: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: MembersBindings; Variables: MembersVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:read');
  const orgId = c.req.param('orgId') || (c.get('user') as { organization_id: string }).organization_id;
  const status = c.req.query('status');
  const service = new UserService(c.env.PRIMARY_DB);
  const users = await service.listUsers(orgId, status || undefined);
  return c.json(users);
});

app.post('/', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
  const body = c.get('validatedBody') as { email: string; display_name: string; role: string; public_key?: string };
  const orgId = c.req.param('orgId') || (c.get('user') as { organization_id: string }).organization_id;
  const user = c.get('user') as { user_id: string };
  
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new UserService(c.env.PRIMARY_DB);
  const newUser = await service.createUser(parsed.data, orgId);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'user_added',
    metadata: { target_user_id: newUser.id, email: newUser.email, role: newUser.role },
  });
  
  return c.json(newUser, 201);
});

app.patch('/:userId/role', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
  const userId = c.req.param('userId')!;
  const body = c.get('validatedBody') as { role: string };
  const user = c.get('user') as { user_id: string; organization_id: string };
  
  const parsed = UpdateUserRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new UserService(c.env.PRIMARY_DB);
  await service.updateUserRole(userId, parsed.data.role);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'role_changed',
    metadata: { target_user_id: userId, new_role: parsed.data.role },
  });
  
  return c.json({ status: 'updated' });
});

app.patch('/:userId/status', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
  const userId = c.req.param('userId')!;
  const body = c.get('validatedBody') as { status: string };
  const user = c.get('user') as { user_id: string; organization_id: string };
  
  const parsed = UpdateUserStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new UserService(c.env.PRIMARY_DB);
  await service.updateUserStatus(userId, parsed.data.status);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: parsed.data.status === 'suspended' ? 'user_suspended' : 'user_reactivated',
    metadata: { target_user_id: userId },
  });
  
  return c.json({ status: 'updated' });
});

export default app;
