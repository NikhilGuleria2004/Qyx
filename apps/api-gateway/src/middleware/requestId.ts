import { Context } from 'hono';

export async function requestId(c: Context, next: () => Promise<void>) {
  const existing = c.req.header('X-Request-ID');
  const requestId = existing || `req_${crypto.randomUUID().replace(/-/g, '')}`;

  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  await next();
}
