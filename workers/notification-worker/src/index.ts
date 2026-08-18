import { Hono } from 'hono';
import { Queue } from '@cloudflare/workers-types';

export type Bindings = {
  OFFLINE_DELIVERY_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/v1/notifications/send', async (c) => {
  return c.json({ status: 'queued' }, 202);
});

export { app };

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: { messages: { id: string; timestamp: Date; body: { conversation_id?: string; message_id?: string; recipient_id?: string; sender_id?: string; message_type?: string } }[] }, env: Bindings, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const body = message.body;
      if (body?.conversation_id && body?.message_id) {
        ctx.waitUntil(
          (async () => {
            await sendGenericPush(body);
          })()
        );
      }
    }
  },
};

async function sendGenericPush(_payload: { conversation_id?: string; message_id?: string; recipient_id?: string; sender_id?: string; message_type?: string }): Promise<void> {
  // Generic push notification (no plaintext/ciphertext per FR-MSG-07, ADR-009)
}
