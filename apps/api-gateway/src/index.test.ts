import { describe, it, expect } from 'vitest';
import app from './index.ts';

describe('api-gateway', () => {
  it('health endpoint returns ok', async () => {
    const res = await app.request('http://localhost/v1/health');
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('ok');
  });

  it('schema-test endpoint validates org via @qyx/schemas', async () => {
    const res = await app.request('http://localhost/v1/schema-test');
    expect(res.status).toBe(200);
    const data = await res.json() as { org_id: string };
    expect(data.org_id).toBe('org_test');
  });
});
