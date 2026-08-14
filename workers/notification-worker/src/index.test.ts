import { describe, it, expect } from 'vitest';
import app from './index.ts';

describe('notification-worker', () => {
  it('send endpoint returns queued', async () => {
    const res = await app.request('http://localhost/v1/notifications/send', {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('queued');
  });
});
