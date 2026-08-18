import { describe, it, expect } from 'vitest';
import { app, type Bindings } from './index.ts';

describe('notification-worker', () => {
  it('send endpoint returns queued', async () => {
    const res = await app.request('http://localhost/v1/notifications/send', {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('queued');
  });

  it('queue handler processes offline delivery messages', async () => {
    const batch = {
      messages: [
        {
          id: 'msg_1',
          timestamp: new Date(),
          body: {
            conversation_id: 'conv_123',
            message_id: 'msg_456',
            recipient_id: 'usr_789',
            sender_id: 'usr_101',
            message_type: 'text',
          },
        },
      ],
    };

    const queueHandler = (await import('./index.ts')).default.queue;
    await expect(
      queueHandler(
        batch,
        {
          OFFLINE_DELIVERY_QUEUE: { send: () => Promise.resolve(), sendBatch: () => Promise.resolve([]), metrics: () => Promise.resolve({}) },
          EMAIL_QUEUE: { send: () => Promise.resolve(), sendBatch: () => Promise.resolve([]), metrics: () => Promise.resolve({}) },
        } as unknown as Bindings,
        { waitUntil: () => {} } as unknown as ExecutionContext
      )
    ).resolves.toBeUndefined();
  });
});
