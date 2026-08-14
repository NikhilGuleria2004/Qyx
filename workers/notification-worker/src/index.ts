import { Hono } from 'hono';

type Bindings = {
  OFFLINE_DELIVERY_QUEUE: Queue;
  EMAIL_QUEUE: Queue;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/v1/notifications/send', async (c) => {
  return c.json({ status: 'queued' }, 202);
});

export default app;
