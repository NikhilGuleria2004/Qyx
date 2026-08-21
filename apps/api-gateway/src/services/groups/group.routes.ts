import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { GroupService } from './group.service';
import { CreateGroupSchema } from './group.schema';
import groupMemberRoutes from './group-member.routes';

type GroupBindings = {
  PRIMARY_DB: D1Database;
};

type GroupVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: GroupBindings; Variables: GroupVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.post('/', auth, orgScope, requirePermission('groups:write'), rbac, adminRateLimit, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = CreateGroupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new GroupService(c.env.PRIMARY_DB);
  const group = await service.createGroup(user.organization_id, user.user_id, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_created',
    metadata: { group_id: group.id, name: group.name },
  });

  return c.json(group, 201);
});

app.get('/', auth, orgScope, requirePermission('groups:read'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new GroupService(c.env.PRIMARY_DB);
  const groups = await service.listGroups(user.organization_id);

  return c.json({ groups });
});

app.delete('/:groupId', auth, orgScope, requirePermission('groups:write'), rbac, adminRateLimit, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId');

  if (!groupId) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Group ID required', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new GroupService(c.env.PRIMARY_DB);
  const group = await service.getGroup(groupId);

  if (!group || (group as { organization_id: string }).organization_id !== user.organization_id) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Group not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  await service.deleteGroup(user.organization_id, groupId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_deleted',
    metadata: { group_id: groupId },
  });

  return c.json({ status: 'deleted' });
});

app.get('/:groupId/members', auth, orgScope, requirePermission('groups:read'), rbac, async (c) => {
  const groupId = c.req.param('groupId')!;

  const service = new GroupService(c.env.PRIMARY_DB);
  const members = await service.listMembers(groupId);

  return c.json({ members });
});

app.route('/:groupId/requests', groupMemberRoutes);

export default app;
