import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { AuditService } from '../audit/audit.service';
import { GroupMemberService } from './group-member.service';
import { ApproveRequestSchema, RejectRequestSchema } from './group-member.schema';

type GroupMemberBindings = {
  PRIMARY_DB: D1Database;
};

type GroupMemberVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
};

const app = new Hono<{ Bindings: GroupMemberBindings; Variables: GroupMemberVariables }>();

app.post('/', auth, orgScope, requirePermission('groups:read'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId')!;

  const service = new GroupMemberService(c.env.PRIMARY_DB);
  await service.requestToJoin(groupId, user.user_id);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_join_requested',
    metadata: { group_id: groupId },
  });

  return c.json({ status: 'requested' }, 201);
});

app.get('/', auth, orgScope, requirePermission('groups:read'), rbac, async (c) => {
  const groupId = c.req.param('groupId')!;

  const service = new GroupMemberService(c.env.PRIMARY_DB);
  const requests = await service.listPendingRequests(groupId);

  return c.json({ requests });
});

app.post('/:reqId/approve', auth, orgScope, requirePermission('groups:write'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId')!;
  const reqId = c.req.param('reqId')!;
  const body = await c.req.json();
  const parsed = ApproveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new GroupMemberService(c.env.PRIMARY_DB);
  const result = await service.approveRequest(groupId, reqId, user.user_id);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_request_approved',
    metadata: { group_id: groupId, user_id: reqId, key_epoch: result.key_epoch },
  });

  return c.json({ status: 'approved', key_epoch: result.key_epoch });
});

app.post('/:reqId/reject', auth, orgScope, requirePermission('groups:write'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId')!;
  const reqId = c.req.param('reqId')!;
  const parsed = RejectRequestSchema.safeParse({});

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new GroupMemberService(c.env.PRIMARY_DB);
  await service.rejectRequest(groupId, reqId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_request_rejected',
    metadata: { group_id: groupId, user_id: reqId },
  });

  return c.json({ status: 'rejected' });
});

app.delete('/:userId', auth, orgScope, requirePermission('groups:write'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const groupId = c.req.param('groupId')!;
  const userId = c.req.param('userId')!;

  const service = new GroupMemberService(c.env.PRIMARY_DB);
  const result = await service.removeMember(groupId, userId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'group_member_removed',
    metadata: { group_id: groupId, removed_user_id: userId, key_epoch: result.key_epoch },
  });

  return c.json({ status: 'removed', key_epoch: result.key_epoch });
});

export default app;
