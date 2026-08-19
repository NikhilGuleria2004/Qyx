import { describe, it, expect } from 'vitest';
import app from './index.ts';

const worker = app as { fetch: typeof app.fetch; scheduled: (event: ScheduledEvent, env: unknown, ctx: ExecutionContext) => Promise<void> };

describe('api-gateway', () => {
  it('health endpoint returns ok', async () => {
    const res = await worker.fetch(new Request('http://localhost/v1/health'));
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('ok');
  });

  it('schema-test endpoint validates org via @qyx/schemas', async () => {
    const res = await worker.fetch(new Request('http://localhost/v1/schema-test'));
    expect(res.status).toBe(200);
    const data = await res.json() as { org_id: string };
    expect(data.org_id).toBe('org_test');
  });

  it('scheduled handler cleans up orphaned pending files', async () => {
    let deletedDb = false;
    const env = {
      PRIMARY_DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: unknown[]) => ({
            all: async () => ({
              results: [
                { id: 'file_1', encrypted_storage_reference: 'org_1/file_1', created_at: Date.now() - 25 * 60 * 60 * 1000 },
              ],
            }),
            run: async () => { deletedDb = true; return { changes: 1 }; },
          }),
        }),
      } as unknown as D1Database,
      B2_KEY_ID: 'test-key-id',
      B2_APPLICATION_KEY: 'test-application-key',
      B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
      B2_REGION: 'us-west-004',
      B2_BUCKET_NAME: 'qyx-attachments-dev',
    };

    await worker.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(deletedDb).toBe(true);
  });
});
