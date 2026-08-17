import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { ChannelService } from './channel.service';
import { CreateChannelSchema, AckPostSchema } from './channel.schema';

type ChannelBindings = {
  PRIMARY_DB: D1Database;
};

type ChannelVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: ChannelBindings; Variables: ChannelVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.post('/', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = CreateChannelSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new ChannelService(c.env.PRIMARY_DB);
  const channel = await service.createChannel(user.organization_id, user.user_id, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_created',
    metadata: { channel_id: channel.id, name: channel.name },
  });

  return c.json(channel, 201);
});

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:read');
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new ChannelService(c.env.PRIMARY_DB);
  const channels = await service.listChannels(user.organization_id);

  return c.json({ channels });
});

app.delete('/:channelId', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId');

  if (!channelId) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Channel ID required', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new ChannelService(c.env.PRIMARY_DB);
  const channel = await service.getChannel(channelId);

  if (!channel) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Channel not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  await service.deleteChannel(channelId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_deleted',
    metadata: { channel_id: channelId },
  });

  return c.json({ status: 'deleted' });
});

app.post('/:channelId/requests', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:read');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId')!;

  const service = new ChannelService(c.env.PRIMARY_DB);
  await service.requestToJoin(channelId, user.user_id);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_join_requested',
    metadata: { channel_id: channelId },
  });

  return c.json({ status: 'requested' }, 201);
});

app.get('/:channelId/requests', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:read');
  const channelId = c.req.param('channelId')!;

  const service = new ChannelService(c.env.PRIMARY_DB);
  const requests = await service.listPendingRequests(channelId);

  return c.json({ requests });
});

app.post('/:channelId/requests/:reqId/approve', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId')!;
  const reqId = c.req.param('reqId')!;
  const body = await c.req.json();
  const parsed = AckPostSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new ChannelService(c.env.PRIMARY_DB);
  const result = await service.approveRequest(channelId, reqId, parsed.data.reaction === 'yes');

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_request_approved',
    metadata: { channel_id: channelId, user_id: reqId, can_post: result.can_post },
  });

  return c.json({ status: 'approved', can_post: result.can_post });
});

app.post('/:channelId/requests/:reqId/reject', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId')!;
  const reqId = c.req.param('reqId')!;

  const service = new ChannelService(c.env.PRIMARY_DB);
  await service.rejectRequest(channelId, reqId);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_request_rejected',
    metadata: { channel_id: channelId, user_id: reqId },
  });

  return c.json({ status: 'rejected' });
});

app.post('/:channelId/posts/:postId/ack', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:read');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId')!;
  const postId = c.req.param('postId')!;
  const body = await c.req.json();
  const parsed = AckPostSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new ChannelService(c.env.PRIMARY_DB);
  await service.ackPost(channelId, postId, user.user_id, parsed.data.reaction);

  return c.json({ status: 'acknowledged' });
});

app.post('/:channelId/posts', auth, orgScope, rbac, adminRateLimit, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'channels:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const channelId = c.req.param('channelId')!;

  const service = new ChannelService(c.env.PRIMARY_DB);
  const member = await service.getChannelMembersList(channelId);
  const isMember = member.some(m => m.user_id === user.user_id && m.status === 'active');

  if (!isMember) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Must be an active channel member to post', request_id: c.get('requestId') as string } },
      403
    );
  }

  const memberData = member.find(m => m.user_id === user.user_id);
  if (!memberData?.can_post) {
    return c.json(
      { error: { code: 'FORBIDDEN_ROLE', message: 'Insufficient channel permissions to post', request_id: c.get('requestId') as string } },
      403
    );
  }

  const postId = `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'channel_post_created',
    metadata: { channel_id: channelId, post_id: postId },
  });

  return c.json({ post_id: postId, status: 'created' }, 201);
});

export default app;
