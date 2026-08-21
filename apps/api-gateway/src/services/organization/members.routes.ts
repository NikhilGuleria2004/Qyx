import { Hono } from 'hono';
import { UserService } from '../users/user.service';
import { CreateUserSchema, UpdateUserRoleSchema, UpdateUserStatusSchema } from '../users/user.schema';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { getUserById, listUsersByOrg } from '../../db/queries/users';

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

app.get('/', auth, orgScope, requirePermission('members:read'), rbac, async (c) => {
  const orgId = c.req.param('orgId') || (c.get('user') as { organization_id: string }).organization_id;
  const status = c.req.query('status');
  const service = new UserService(c.env.PRIMARY_DB);
  const users = await service.listUsers(orgId, status || undefined);
  return c.json(users);
});

app.post('/', auth, orgScope, requirePermission('members:write'), rbac, adminRateLimit, validate, async (c) => {
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

app.patch('/:userId/role', auth, orgScope, requirePermission('members:write'), rbac, adminRateLimit, async (c) => {
  const userId = c.req.param('userId')!;
  const body = await c.req.json<{ role: string }>();
  const user = c.get('user') as { user_id: string; organization_id: string; role: string };
  
  if (userId === user.user_id) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot modify your own role', request_id: c.get('requestId') as string } },
      403
    );
  }

  const parsed = UpdateUserRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const targetUser = await getUserById(c.env.PRIMARY_DB, userId);
  if (!targetUser || targetUser.organization_id !== user.organization_id) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  if (targetUser.role === 'super_admin' && parsed.data.role !== 'super_admin') {
    const superAdmins = await listUsersByOrg(c.env.PRIMARY_DB, user.organization_id, 'active');
    const activeSuperAdmins = superAdmins.filter((u) => u.role === 'super_admin');
    if (activeSuperAdmins.length <= 1) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Cannot demote the last active super_admin', request_id: c.get('requestId') as string } },
        403
      );
    }
  }

  const service = new UserService(c.env.PRIMARY_DB);
  await service.updateUserRole(user.organization_id, userId, parsed.data.role);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'role_changed',
    metadata: { target_user_id: userId, new_role: parsed.data.role },
  });
  
  return c.json({ status: 'updated' });
});

app.patch('/:userId/status', auth, orgScope, requirePermission('members:write'), rbac, adminRateLimit, async (c) => {
  const userId = c.req.param('userId')!;
  const body = await c.req.json<{ status: string }>();
  const user = c.get('user') as { user_id: string; organization_id: string; role: string };
  
  if (userId === user.user_id) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot modify your own status', request_id: c.get('requestId') as string } },
      403
    );
  }

  const parsed = UpdateUserStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const targetUser = await getUserById(c.env.PRIMARY_DB, userId);
  if (!targetUser || targetUser.organization_id !== user.organization_id) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  if (parsed.data.status === 'suspended' && targetUser.role === 'super_admin') {
    const superAdmins = await listUsersByOrg(c.env.PRIMARY_DB, user.organization_id, 'active');
    const activeSuperAdmins = superAdmins.filter((u) => u.role === 'super_admin');
    if (activeSuperAdmins.length <= 1) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Cannot suspend the last active super_admin', request_id: c.get('requestId') as string } },
        403
      );
    }
  }

  const service = new UserService(c.env.PRIMARY_DB);
  await service.updateUserStatus(user.organization_id, userId, parsed.data.status);
  
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
