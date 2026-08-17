import { z } from 'zod';
import { Context } from 'hono';
import { createLogger } from '../utils/logger';
import { MetricsService } from '../services/metrics/metrics.service';

const SessionSchema = z.object({
  user_id: z.string(),
  organization_id: z.string(),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']),
  device_id: z.string().optional(),
});

export async function auth(c: Context, next: () => Promise<void>) {
  const requestId = c.get('requestId') as string;
  const logger = createLogger(requestId);
  const startTime = Date.now();

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('Missing authorization header', { path: c.req.path, method: c.req.method });
    if (c.env && c.env.PRIMARY_DB) {
      const metricsService = new MetricsService(c.env.PRIMARY_DB);
      metricsService.recordEvent({
        service: 'identity',
        operation: 'login',
        status: 'error',
        latency_ms: Date.now() - startTime,
        metadata: { reason: 'missing_auth_header' },
      }).catch(() => {});
    }
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Missing authorization header', request_id: requestId } },
      401
    );
  }

  const token = authHeader.slice(7);
  
  try {
    const kv = c.env.SESSION_KV;
    const sessionData = await kv.get(token, 'json');
    
    if (!sessionData) {
      logger.warn('Invalid or expired session', { path: c.req.path, method: c.req.method });
      if (c.env && c.env.PRIMARY_DB) {
        const metricsService = new MetricsService(c.env.PRIMARY_DB);
        metricsService.recordEvent({
          service: 'identity',
          operation: 'login',
          status: 'error',
          latency_ms: Date.now() - startTime,
          metadata: { reason: 'invalid_session' },
        }).catch(() => {});
      }
      return c.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired session', request_id: requestId } },
        401
      );
    }

    const session = SessionSchema.parse(sessionData);
    c.set('user', session);
    await next();
  } catch (err) {
    logger.error('Invalid session', { path: c.req.path, method: c.req.method, error: String(err) });
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid session', request_id: requestId } },
      401
    );
  }
}

export async function optionalAuth(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const kv = c.env.SESSION_KV;
      const sessionData = await kv.get(token, 'json');
      if (sessionData) {
        const session = SessionSchema.parse(sessionData);
        c.set('user', session);
      }
    } catch {
      // session parse failed
    }
  }
  await next();
}

export async function requireSuperAdmin(c: Context, next: () => Promise<void>) {
  const requestId = c.get('requestId') as string;
  const logger = createLogger(requestId);
  const user = c.get('user');
  if (!user) {
    logger.warn('Super admin access attempted without authentication');
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: requestId } },
      401
    );
  }

  const role = SessionSchema.shape.role.parse((user as { role: string }).role);
  if (role !== 'super_admin') {
    logger.warn('Insufficient role for super admin access', { role });
    return c.json(
      { error: { code: 'FORBIDDEN_ROLE', message: 'Super Admin access required', request_id: requestId } },
      403
    );
  }

  await next();
}
