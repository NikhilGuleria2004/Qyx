import { Hono } from 'hono';
import { OrganizationSchema } from '@qyx/schemas';
import { ConversationDO } from './durable-objects/conversation';
import { ChannelDO } from './durable-objects/channel';
import organizationRoutes from './services/organization/organization.routes';
import authRoutes from './services/auth/auth.routes';
import webauthnRoutes from './services/identity/webauthn.routes';

type Bindings = {
  PRIMARY_DB: D1Database;
  ATTACHMENTS_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  CHALLENGE_KV: KVNamespace;
  CONVERSATION_DO: DurableObjectNamespace;
  CHANNEL_DO: DurableObjectNamespace;
  OFFLINE_DELIVERY_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
  AUDIT_QUEUE: Queue;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/v1/health', (c) => {
  return c.json({ status: 'ok', service: 'api-gateway' });
});

app.get('/v1/schema-test', (c) => {
  const org = OrganizationSchema.parse({
    id: 'org_test',
    name: 'Test',
    status: 'active',
    security_tier: 'standard',
    created_at: Date.now(),
  });
  return c.json({ org_id: org.id });
});

app.route('/v1/organizations', organizationRoutes);
app.route('/v1/auth', authRoutes);
app.route('/v1/auth/webauthn', webauthnRoutes);

export { ConversationDO, ChannelDO };
export default app;
