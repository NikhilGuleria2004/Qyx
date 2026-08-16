import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
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
};

const app = new Hono<{ Bindings: GroupBindings; Variables: GroupVariables }>();

app.post('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'groups:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = CreateGroupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
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

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'groups:read');
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new GroupService(c.env.PRIMARY_DB);
  const groups = await service.listGroups(user.organization_id);

  return c.json({ groups });
});

app.delete('/:groupId', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'groups:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId');

  if (!groupId) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Group ID required', request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new GroupService(c.env.PRIMARY_DB);
  const group = await service.getGroup(groupId);

  if (!group) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Group not found', request_id: crypto.randomUUID() } },
      404
    );
  }

  await service.deleteGroup(groupId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_deleted',
    metadata: { group_id: groupId },
  });

  return c.json({ status: 'deleted' });
});

app.route('/:groupId/requests', groupMemberRoutes);

export default app;
