import { describe, it, expect } from 'vitest';
import { Hono, Context } from 'hono';
import { rbac, requirePermission, requireMinimumRole } from './rbac';

type User = { user_id: string; organization_id: string; role: string };

function withUser(user: User) {
  return async (c: Context, next: () => Promise<void>) => {
    (c as unknown as { set: (key: string, value: unknown) => void }).set('user', user);
    await next();
  };
}

function withRequestId() {
  return async (c: Context, next: () => Promise<void>) => {
    (c as unknown as { set: (key: string, value: unknown) => void }).set('requestId', 'req_test');
    await next();
  };
}

describe('rbac integration', () => {
  it('employee gets 403 on members:write via requirePermission before rbac', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'employee' }));
    app.patch('/members/role', requirePermission('members:write'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/members/role', { method: 'PATCH' });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('admin gets 200 on members:write via requirePermission before rbac', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'admin' }));
    app.patch('/members/role', requirePermission('members:write'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/members/role', { method: 'PATCH' });
    expect(res.status).toBe(200);
  });

  it('manager gets 403 on org:update via requirePermission before rbac', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'manager' }));
    app.patch('/org/settings', requirePermission('org:update'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/org/settings', { method: 'PATCH' });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('security_admin gets 403 on groups:write via requirePermission before rbac', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'security_admin' }));
    app.post('/groups', requirePermission('groups:write'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/groups', { method: 'POST' });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('super_admin bypasses all permission checks via wildcard', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'super_admin' }));
    app.post('/groups', requirePermission('groups:write'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/groups', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('requireMinimumRole blocks employee from admin-only routes', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'employee' }));
    app.delete('/devices/:deviceId', requireMinimumRole('admin'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/devices/dev_1', { method: 'DELETE' });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('requireMinimumRole allows manager on admin-required routes when role meets threshold', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser({ user_id: 'usr_1', organization_id: 'org_1', role: 'manager' }));
    app.get('/members', requireMinimumRole('manager'), rbac, async (c) => c.json({ ok: true }));
    const res = await app.request('http://localhost/members');
    expect(res.status).toBe(200);
  });
});
