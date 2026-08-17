import { Hono } from 'hono';
import { OrganizationSchema } from '@qyx/schemas';
import { ConversationDO } from './durable-objects/conversation';
import { ChannelDO } from './durable-objects/channel';
import { getOrphanedFiles, deleteFile } from './db/queries/files';
import organizationRoutes from './services/organization/organization.routes';
import authRoutes from './services/auth/auth.routes';
import webauthnRoutes from './services/identity/webauthn.routes';
import deviceRoutes from './services/devices/device.routes';
import conversationRoutes from './services/conversations/conversation.routes';
import messageRoutes from './services/messages/message.routes';
import realtimeRoutes from './realtime/realtime.routes';
import groupRoutes from './services/groups/group.routes';
import channelRoutes from './services/channels/channel.routes';
import fileRoutes from './services/files/file.routes';
import ssoRoutes from './services/sso/sso.routes';
import { requestId } from './middleware/requestId';
import { metricsMiddleware } from './middleware/metrics';

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

app.use('*', requestId);
app.use('*', metricsMiddleware);

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
app.route('/v1/auth/sso', ssoRoutes);
app.route('/v1/me/devices', deviceRoutes);
app.route('/v1/conversations', conversationRoutes);
app.route('/v1/conversations/:conversationId/messages', messageRoutes);
app.route('/v1/realtime', realtimeRoutes);
app.route('/v1/groups', groupRoutes);
app.route('/v1/channels', channelRoutes);
app.route('/v1/files', fileRoutes);

export { ConversationDO, ChannelDO };

async function cleanupOrphanedFiles(env: Bindings) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result = await getOrphanedFiles(env.PRIMARY_DB, cutoff);
  const orphans = result as Array<{ id: string; encrypted_storage_reference: string }>;
  
  for (const file of orphans) {
    try {
      await env.ATTACHMENTS_BUCKET.delete(file.encrypted_storage_reference);
    } catch {
      // R2 object may not exist — continue with DB cleanup
    }
    await deleteFile(env.PRIMARY_DB, file.id);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) {
    await cleanupOrphanedFiles(env);
  },
};
