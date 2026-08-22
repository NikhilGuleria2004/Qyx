import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { broadcast } from '../../realtime/realtime';
import { MessageService } from './message.service';
import { SendMessageSchema } from './message.schema';

type MessageBindings = {
  PRIMARY_DB: D1Database;
  CONVERSATION_DO: DurableObjectNamespace;
};

type MessageVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: MessageBindings; Variables: MessageVariables }>();

const messageRateLimit = createRateLimit({
  category: 'message',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

app.post('/:conversationId/messages', auth, orgScope, requirePermission('messages:write'), rbac, messageRateLimit, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const conversationId = c.req.param('conversationId')!;
  const body = await c.req.json();
  const parsed = SendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new MessageService(c.env.PRIMARY_DB);
  const result = await service.sendMessage(conversationId, user.user_id, user.organization_id, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'message_sent',
    metadata: { message_id: result.id, conversation_id: conversationId },
  });

  const doStub = c.env.CONVERSATION_DO.get(c.env.CONVERSATION_DO.idFromName(conversationId));
  try {
    await doStub.fetch('https://do.local/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'new_message',
        messageId: result.id,
        ciphertext: Array.from(new Uint8Array(result.ciphertext)).map(b => b.toString(16).padStart(2, '0')).join(''),
        message_type: result.message_type,
        sender_id: result.sender_id,
        conversation_id: result.conversation_id,
        recipient_id: result.recipient_ids[0] || null,
      }),
    });
  } catch {
    // DO notification failed — message is still persisted
  }

  broadcast(conversationId, {
    type: 'message',
    conversation_id: conversationId,
    message: {
      id: result.id,
      ciphertext: Array.from(new Uint8Array(result.ciphertext)).map(b => b.toString(16).padStart(2, '0')).join(''),
      message_type: result.message_type,
      sender_id: result.sender_id,
      created_at: result.created_at,
    },
  });

  const metricsService = new MetricsService(c.env.PRIMARY_DB);
  metricsService.recordEvent({
    service: 'messaging',
    operation: 'message_sent',
    organization_id: user.organization_id,
    user_id: user.user_id,
    status: 'success',
    latency_ms: 0,
    metadata: { message_id: result.id, conversation_id: conversationId, message_type: result.message_type },
  }).catch(() => {});

  return c.json(result, 201);
});

app.get('/:conversationId/messages', auth, orgScope, requirePermission('messages:read'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const conversationId = c.req.param('conversationId')!;

  const service = new MessageService(c.env.PRIMARY_DB);
  const messages = await service.listMessages(conversationId, user.user_id, user.organization_id);

  return c.json({ messages });
});

app.get('/:conversationId/keys', auth, orgScope, requirePermission('messages:read'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const conversationId = c.req.param('conversationId')!;

  const members = await c.env.PRIMARY_DB.prepare(
    `SELECT u.id, u.public_key FROM users u
     JOIN conversation_members cm ON u.id = cm.user_id
     WHERE cm.conversation_id = ? AND cm.removed_at IS NULL
     AND u.organization_id = ?`
  ).bind(conversationId, user.organization_id).all();

  const memberList = (members.results as { id: string; public_key?: string }[]).map(m => ({
    user_id: m.id,
    public_key: m.public_key || null,
  }));

  return c.json({ conversation_id: conversationId, members: memberList });
});

export default app;
