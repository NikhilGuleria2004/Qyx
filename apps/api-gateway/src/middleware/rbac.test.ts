import { describe, it, expect } from 'vitest';
import { Hono, Context } from 'hono';
import { rbac } from './rbac';

type User = { user_id: string; organization_id: string; role: string };

function withUser(user: User) {
  return async (c: Context, next: () => Promise<void>) => {
    (c as unknown as { set: (key: string, value: unknown) => void }).set('user', user);
    await next();
  };
}

describe('rbac', () => {
  it('returns 401 when no user is set', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.get('/auth', rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/auth');
    expect(res.status).toBe(401);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('UNAUTHENTICATED');
  });

  it('allows access when no permission or role requirement is set', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'employee' }));
    app.get('/auth', rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/auth');
    expect(res.status).toBe(200);
  });

  it('super_admin bypasses permission checks via wildcard', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'super_admin' }));
    app.get('/perm', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/perm');
    expect(res.status).toBe(200);
  });

  it('allows access when role has required permission', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'admin' }));
    app.get('/perm', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/perm');
    expect(res.status).toBe(200);
  });

  it('denies access when role lacks required permission', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'employee' }));
    app.get('/perm', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'members:write');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/perm');
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('allows access when role meets minimum role level', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'admin' }));
    app.get('/role', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('minimumRole', 'admin');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/role');
    expect(res.status).toBe(200);
  });

  it('denies access when role is below minimum role level', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'employee' }));
    app.get('/role', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('minimumRole', 'admin');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/role');
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('manager can read groups but not write members', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'manager' }));
    app.get('/perm', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'groups:read');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/perm');
    expect(res.status).toBe(200);
  });

  it('security_admin can read audit but not write members', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
      await next();
    });
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'security_admin' }));
    app.get('/perm', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'audit:read');
      await next();
    }, rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/perm');
    expect(res.status).toBe(200);
  });
});
