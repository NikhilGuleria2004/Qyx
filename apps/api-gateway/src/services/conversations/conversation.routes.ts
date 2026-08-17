import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { AuditService } from '../audit/audit.service';
import { ConversationService } from './conversation.service';
import { CreateConversationSchema } from './conversation.schema';

type ConversationBindings = {
  PRIMARY_DB: D1Database;
};

type ConversationVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: ConversationBindings; Variables: ConversationVariables }>();

app.post('/', auth, orgScope, rbac, async (c) => {
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = CreateConversationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new ConversationService(c.env.PRIMARY_DB);
  const conversation = await service.createDirectConversation(
    user.user_id,
    user.organization_id,
    parsed.data.user_id
  );

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'conversation_created',
    metadata: { conversation_id: conversation.id, type: conversation.type },
  });

  return c.json(conversation, 201);
});

app.get('/', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'conversations:read');
  const user = c.get('user') as { user_id: string; organization_id: string };

  const service = new ConversationService(c.env.PRIMARY_DB);
  const conversations = await service.getUserConversations(user.user_id, user.organization_id);

  return c.json({ conversations });
});

export default app;
