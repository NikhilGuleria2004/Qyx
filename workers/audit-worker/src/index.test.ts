import { describe, it, expect } from 'vitest';
import app from './index.ts';

describe('audit-worker', () => {
  it('ingest endpoint returns queued', async () => {
    const res = await app.request('http://localhost/v1/audit/ingest', {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('queued');
  });
});
