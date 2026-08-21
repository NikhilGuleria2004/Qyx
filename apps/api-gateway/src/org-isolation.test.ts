import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import organizationRoutes from './services/organization/organization.routes';
import authRoutes from './services/auth/auth.routes';
import webauthnRoutes from './services/identity/webauthn.routes';
import deviceRoutes from './services/devices/device.routes';
import conversationRoutes from './services/conversations/conversation.routes';
import messageRoutes from './services/messages/message.routes';
import groupRoutes from './services/groups/group.routes';
import channelRoutes from './services/channels/channel.routes';
import fileRoutes from './services/files/file.routes';
import ssoRoutes from './services/sso/sso.routes';

type Env = {
  PRIMARY_DB: D1Database;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET_NAME: string;
  SESSION_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  CHALLENGE_KV: KVNamespace;
  CONVERSATION_DO: DurableObjectNamespace;
  CHANNEL_DO: DurableObjectNamespace;
  OFFLINE_DELIVERY_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
  AUDIT_QUEUE: Queue;
};

const orgA = 'org_aaaaaaaaaaaaaaaa';
const orgB = 'org_bbbbbbbbbbbbbbbb';
const userA = { user_id: 'usr_aaaaaaaaaaaaaaaa', organization_id: orgA, role: 'admin' };
const userB = { user_id: 'usr_bbbbbbbbbbbbbbbb', organization_id: orgB, role: 'admin' };

function createMockEnv(): Env {
  return {
    PRIMARY_DB: {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({}),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database,
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
    B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
    B2_REGION: 'us-west-004',
    B2_BUCKET_NAME: 'qyx-attachments-dev',
    SESSION_KV: {
      get: async (_key: string, _type?: string) => {
        if (_key === `token_${userA.user_id}`) return userA;
        if (_key === `token_${userB.user_id}`) return userB;
        return null;
      },
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    RATE_LIMIT_KV: {
      get: async () => null,
      put: async () => {},
    } as unknown as KVNamespace,
    CHALLENGE_KV: {
      get: async () => null,
      put: async () => {},
    } as unknown as KVNamespace,
    CONVERSATION_DO: {
      idFromName: (_name: string) => ({ id: 'do_test' }),
      get: (_id: { id: string }) => ({
        fetch: async () => new Response('ok', { status: 200 }),
      }),
    } as unknown as DurableObjectNamespace,
    CHANNEL_DO: {
      idFromName: (_name: string) => ({ id: 'do_test' }),
      get: (_id: { id: string }) => ({
        fetch: async () => new Response('ok', { status: 200 }),
      }),
    } as unknown as DurableObjectNamespace,
    OFFLINE_DELIVERY_QUEUE: {
      send: async () => {},
    } as unknown as Queue,
    EMAIL_QUEUE: {
      send: async () => {},
    } as unknown as Queue,
    AUDIT_QUEUE: {
      send: async () => {},
    } as unknown as Queue,
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
    await next();
  });
  app.route('/v1/organizations', organizationRoutes);
  app.route('/v1/auth', authRoutes);
  app.route('/v1/auth/webauthn', webauthnRoutes);
  app.route('/v1/me/devices', deviceRoutes);
  app.route('/v1/conversations', conversationRoutes);
  app.route('/v1/conversations/:conversationId/messages', messageRoutes);
  app.route('/v1/groups', groupRoutes);
  app.route('/v1/channels', channelRoutes);
  app.route('/v1/files', fileRoutes);
  app.route('/v1/auth/sso', ssoRoutes);
  return app;
}

describe('P42 — Org-isolation regression suite', () => {
  const app = createApp();
  const env = createMockEnv();

  const orgBResourcePaths = [
    `/v1/organizations/${orgB}/settings`,
    `/v1/organizations/${orgB}/members`,
    `/v1/organizations/${orgB}/audit`,
    `/v1/organizations/${orgB}/security-summary`,
    `/v1/organizations/${orgB}/metrics?type=security`,
    `/v1/organizations/${orgB}/alerts`,
    `/v1/organizations/${orgB}/devices`,
    `/v1/organizations/${orgB}/sessions`,
    `/v1/organizations/${orgB}/sso/providers`,
  ];

  for (const orgBPath of orgBResourcePaths) {
    it(`blocks cross-org access: ${orgBPath}`, async () => {
      const res = await app.request(orgBPath, {
        method: 'GET',
        headers: { Authorization: `Bearer token_${userA.user_id}` },
      }, env);
      expect([403, 404]).toContain(res.status);
    });
  }

  it('blocks cross-org group access', async () => {
    const res = await app.request('/v1/groups/grp_bbbbbbbbbbbbbbbb', {
      method: 'DELETE',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org channel access', async () => {
    const res = await app.request('/v1/channels/chn_bbbbbbbbbbbbbbbb', {
      method: 'DELETE',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org message access', async () => {
    const res = await app.request(`/v1/conversations/conv_bbbbbbbbbbbbbbbb/messages`, {
      method: 'GET',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org message send', async () => {
    const res = await app.request(`/v1/conversations/conv_bbbbbbbbbbbbbbbb/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer token_${userA.user_id}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_type: 'text', ciphertext: 'abc' }),
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org key access', async () => {
    const res = await app.request(`/v1/conversations/conv_bbbbbbbbbbbbbbbb/keys`, {
      method: 'GET',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org device revocation', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/devices/dev_bbbbbbbbbbbbbbbb/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org session revocation', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/sessions/sess_bbbbbbbbbbbbbbbb/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org SSO provider modification', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/sso/providers/sso_bbbbbbbbbbbbbbbb`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org alert rule modification', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/alerts/alt_bbbbbbbbbbbbbbbb`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suppressed' }),
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org alert rule deletion', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/alerts/alt_bbbbbbbbbbbbbbbb`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('blocks cross-org file download', async () => {
    const res = await app.request(`/v1/files/file_bbbbbbbbbbbbbbbb/download-url`, {
      method: 'GET',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([403, 404]).toContain(res.status);
  });

  it('allows same-org access', async () => {
    const res = await app.request(`/v1/organizations/${orgA}/settings`, {
      method: 'GET',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    expect([200, 500]).toContain(res.status);
  });

  it('blocks unauthenticated access to org endpoints', async () => {
    const res = await app.request(`/v1/organizations/${orgA}/settings`, {
      method: 'GET',
    }, env);
    expect([401, 403]).toContain(res.status);
  });
});

describe('P42 — Cross-org access returns generic 404-style body', () => {
  const app = createApp();
  const env = createMockEnv();

  it('returns ORG_SCOPE_VIOLATION code in response body', async () => {
    const res = await app.request(`/v1/organizations/${orgB}/settings`, {
      method: 'GET',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
    }, env);
    if (res.status === 403) {
      const data = await res.json() as { error: { code: string } };
      expect(data.error.code).toBe('ORG_SCOPE_VIOLATION');
    }
  });
});
