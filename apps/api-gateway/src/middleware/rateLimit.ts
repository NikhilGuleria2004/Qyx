import { Context } from 'hono';

export async function rateLimit(c: Context, next: () => Promise<void>) {
  const key = c.req.header('cf-connecting-ip') || 'anon';
  const route = c.req.path;
  const cacheKey = `rl:${route}:${key}`;
  
  const kv = c.env.RATE_LIMIT_KV;
  const windowMs = 60_000;
  const limit = 10;
  
  const raw = await kv.get(cacheKey, 'json');
  const data = raw as { count: number; resetAt: number } | null;
  const now = Date.now();
  
  if (!data || now > data.resetAt) {
    await kv.put(cacheKey, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: 61 });
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(limit - 1));
    await next();
    return;
  }
  
  if (data.count >= limit) {
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests', request_id: crypto.randomUUID() } },
      429
    );
  }
  
  data.count++;
  await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: Math.ceil((data.resetAt - now) / 1000) });
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(limit - data.count));
  await next();
}
