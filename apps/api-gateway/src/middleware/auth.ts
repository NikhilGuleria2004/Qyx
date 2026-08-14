import { z } from 'zod';
import { Context } from 'hono';

const SessionSchema = z.object({
  user_id: z.string(),
  organization_id: z.string(),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']),
  device_id: z.string().optional(),
});

export async function auth(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Missing authorization header', request_id: crypto.randomUUID() } },
      401
    );
  }

  const token = authHeader.slice(7);
  
  try {
    const kv = c.env.SESSION_KV;
    const sessionData = await kv.get(token, 'json');
    
    if (!sessionData) {
      return c.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired session', request_id: crypto.randomUUID() } },
        401
      );
    }

    const session = SessionSchema.parse(sessionData);
    c.set('user', session);
    await next();
  } catch (err) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid session', request_id: crypto.randomUUID() } },
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
  const user = c.get('user');
  if (!user) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
      401
    );
  }

  const role = SessionSchema.shape.role.parse((user as { role: string }).role);
  if (role !== 'super_admin') {
    return c.json(
      { error: { code: 'FORBIDDEN_ROLE', message: 'Super Admin access required', request_id: crypto.randomUUID() } },
      403
    );
  }

  await next();
}
