import { Context } from 'hono';

type RateLimitConfig = {
  category: 'auth' | 'message' | 'file' | 'admin';
  getIdentifier: (c: Context) => string;
  getOrgId?: (c: Context) => string | undefined;
};

const DEFAULT_LIMITS: Record<string, number> = {
  auth: 10,
  message: 60,
  file: 20,
  admin: 30,
};

export function createRateLimit(config: RateLimitConfig) {
  return async (c: Context, next: () => Promise<void>) => {
    const identifier = config.getIdentifier(c);
    if (!identifier) {
      return c.json(
        { error: { code: 'RATE_LIMIT_ERROR', message: 'Unable to determine rate limit identifier', request_id: c.get('requestId') as string } },
        400
      );
    }

    const now = Date.now();
    const windowMinutes = 1;
    const windowStart = Math.floor(now / (windowMinutes * 60 * 1000));
    const key = `ratelimit:${config.category}:${identifier}:${windowStart}`;

    let limit = DEFAULT_LIMITS[config.category] || 30;

    if (config.getOrgId && c.env.PRIMARY_DB) {
      try {
        const orgId = config.getOrgId(c);
        if (orgId) {
          const column = `rate_limit_${config.category}_per_min`;
          const row = await c.env.PRIMARY_DB.prepare(
            `SELECT ${column} FROM org_security_policy WHERE organization_id = ?`
          ).bind(orgId).first() as Record<string, unknown> | undefined;
          const orgLimit = row?.[column];
          if (typeof orgLimit === 'number' && orgLimit > 0) {
            limit = orgLimit;
          }
        }
      } catch {
        // org lookup failed, use default
      }
    }

    let count = 0;
    try {
      const stored = await c.env.RATE_LIMIT_KV.get(key);
      if (stored) {
        count = parseInt(stored, 10);
      }
    } catch {
      // KV read failed
    }

    if (count >= limit) {
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(windowStart));
      return c.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Rate limit exceeded: ${limit} requests per minute`, request_id: c.get('requestId') as string } },
        429
      );
    }

    count++;
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    c.header('X-RateLimit-Reset', String(windowStart));
    try {
      const ttl = windowMinutes * 60 + 30;
      await c.env.RATE_LIMIT_KV.put(key, String(count), { expirationTtl: ttl });
    } catch {
      // KV write failed, allow request
    }

    await next();
  };
}

export function getClientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
