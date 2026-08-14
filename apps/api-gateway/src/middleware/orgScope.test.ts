import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('orgScope', () => {
  it('returns 403 for cross-org access', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('user', { user_id: 'usr_123', organization_id: 'org_same', role: 'employee' });
      await next();
    });
    app.get('/test/:orgId', async (c, next) => {
      const { orgScope } = await import('./orgScope');
      return orgScope(c, next);
    }, (c) => c.json({ ok: true }));
    
    const res = await app.request('http://localhost/test/org_other');
    expect(res.status).toBe(403);
    const data = await res.json() as { error: { code: string } };
    expect(data.error.code).toBe('ORG_SCOPE_VIOLATION');
  });

  it('allows same-org access', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as unknown as { set: (key: string, value: unknown) => void }).set('user', { user_id: 'usr_123', organization_id: 'org_same', role: 'employee' });
      await next();
    });
    app.get('/test/:orgId', async (c, next) => {
      const { orgScope } = await import('./orgScope');
      return orgScope(c, next);
    }, (c) => c.json({ ok: true }));
    
    const res = await app.request('http://localhost/test/org_same');
    expect(res.status).toBe(200);
  });
});
