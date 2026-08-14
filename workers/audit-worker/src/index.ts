import { Hono } from 'hono';

type Bindings = {
  AUDIT_QUEUE: Queue;
  PRIMARY_DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/v1/audit/ingest', async (c) => {
  return c.json({ status: 'queued' }, 202);
});

export default app;
