import { describe, it, expect } from 'vitest';
import { app } from './index.ts';

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
    await expect(queueHandler(batch, {} as { OFFLINE_DELIVERY_QUEUE: { send: (message: unknown) => void }; EMAIL_QUEUE: { send: (message: unknown) => void } }, { waitUntil: () => {} } as unknown as ExecutionContext)).resolves.toBeUndefined();
  });
});
