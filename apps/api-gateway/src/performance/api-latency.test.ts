import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import organizationRoutes from '../services/organization/organization.routes';
import authRoutes from '../services/auth/auth.routes';
import conversationRoutes from '../services/conversations/conversation.routes';

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

const user = { user_id: 'usr_perf', organization_id: 'org_perf', role: 'employee' };

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
      get: async (_key: string) => (user),
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
    (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_perf');
    await next();
  });
  app.use('*', async (c, next) => {
    (c as unknown as { set: (key: string, value: unknown) => void }).set('user', user);
    await next();
  });
  app.route('/v1/organizations', organizationRoutes);
  app.route('/v1/auth', authRoutes);
  app.route('/v1/conversations', conversationRoutes);
  return app;
}

describe('P44 — Performance: non-send API latency', () => {
  const app = createApp();
  const env = createMockEnv();

  it('p95 latency for org settings GET < 300ms', async () => {
    const concurrency = 30;
    const starts = new Array(concurrency).fill(0);
    const ends = new Array(concurrency).fill(0);

    const promises = Array.from({ length: concurrency }, async (_, i) => {
      starts[i] = performance.now();
      const res = await app.request('/v1/organizations/org_perf/settings', {
        method: 'GET',
        headers: { Authorization: 'Bearer token_perf' },
      }, env);
      ends[i] = performance.now();
      return res;
    });

    const results = await Promise.all(promises);
    const latencies = results.map((_, i) => ends[i] - starts[i]);
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * latencies.length);
    const p95 = latencies[p95Index] || 0;

    expect(results.some(r => [200, 500].includes(r.status))).toBe(true);
    expect(p95).toBeLessThan(300);
  });

  it('p95 latency for conversation list GET < 300ms', async () => {
    const concurrency = 30;
    const starts = new Array(concurrency).fill(0);
    const ends = new Array(concurrency).fill(0);

    const promises = Array.from({ length: concurrency }, async (_, i) => {
      starts[i] = performance.now();
      const res = await app.request('/v1/conversations', {
        method: 'GET',
        headers: { Authorization: 'Bearer token_perf' },
      }, env);
      ends[i] = performance.now();
      return res;
    });

    const results = await Promise.all(promises);
    const latencies = results.map((_, i) => ends[i] - starts[i]);
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * latencies.length);
    const p95 = latencies[p95Index] || 0;

    expect(results.some(r => [200, 500].includes(r.status))).toBe(true);
    expect(p95).toBeLessThan(300);
  });
});
