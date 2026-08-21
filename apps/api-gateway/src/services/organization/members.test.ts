import { describe, it, expect } from 'vitest';
import { Hono, Context } from 'hono';
import membersRoutes from './members.routes';

type Env = {
  PRIMARY_DB: D1Database;
  SESSION_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  CHALLENGE_KV: KVNamespace;
};

const orgA = 'org_aaaaaaaaaaaaaaaa';
const orgB = 'org_bbbbbbbbbbbbbbbb';

const userA = { user_id: 'usr_aaaaaaaaaaaaaaaa', organization_id: orgA, role: 'admin' as const, status: 'active' as const };
const userB = { user_id: 'usr_bbbbbbbbbbbbbbbb', organization_id: orgB, role: 'admin' as const, status: 'active' as const };
const superAdminA = { user_id: 'usr_super_aaaaaaaa', organization_id: orgA, role: 'super_admin' as const, status: 'active' as const };

function createMockEnv(overrides?: { targetUserOrg?: string; superAdminCount?: number }): Env {
  const targetUserOrg = overrides?.targetUserOrg || orgA;
  const superAdminCount = overrides?.superAdminCount ?? 1;

  return {
    PRIMARY_DB: {
      prepare: (_sql: string) => {
        const sql = _sql as string;
        if (sql.includes('SELECT id, organization_id, email, display_name, role, status, public_key, created_at, last_active_at FROM users WHERE id = ?')) {
          return {
            bind: (...args: unknown[]) => {
              const userId = args[0] as string;
              if (userId === userA.user_id) return { first: async () => ({ ...userA, email: 'a@a.com', display_name: 'User A', status: 'active', public_key: '', created_at: Date.now(), last_active_at: Date.now() }) };
              if (userId === userB.user_id) return { first: async () => ({ ...userB, email: 'b@b.com', display_name: 'User B', status: 'active', public_key: '', created_at: Date.now(), last_active_at: Date.now() }) };
              if (userId === superAdminA.user_id) return { first: async () => ({ ...superAdminA, email: 'sa@a.com', display_name: 'Super Admin', status: 'active', public_key: '', created_at: Date.now(), last_active_at: Date.now() }) };
              return { first: async () => null };
            },
          };
        }
        if (sql.includes('SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND role = ? AND status = ?')) {
          return {
            bind: (...args: unknown[]) => {
              const orgId = args[0] as string;
              const role = args[1] as string;
              if (orgId === orgA && role === 'super_admin') {
                return { first: async () => ({ count: superAdminCount }) };
              }
              return { first: async () => ({ count: 0 }) };
            },
          };
        }
        if (sql.includes('SELECT * FROM users WHERE organization_id = ? AND status = ?')) {
          return {
            bind: (...args: unknown[]) => {
              const orgId = args[0] as string;
              if (orgId === orgA) {
                const users: Array<{ user_id: string; organization_id: string; role: string; status: string }> = [
                  userA,
                  superAdminA,
                  { user_id: 'usr_emp_aaaaaaaa', organization_id: orgA, role: 'employee' as const, status: 'active' },
                ];
                if (superAdminCount >= 2) {
                  users.push({ user_id: 'usr_super_bbbbbbbbbb', organization_id: orgA, role: 'super_admin' as const, status: 'active' });
                }
                return { all: async () => ({ results: users.filter(u => u.role === 'super_admin') }) };
              }
              return { all: async () => ({ results: [] }) };
            },
          };
        }
        if (sql.startsWith('UPDATE users SET role') || sql.startsWith('UPDATE users SET status')) {
          return {
            bind: (...args: unknown[]) => {
              const orgId = args[args.length - 1] as string;
              if (orgId === targetUserOrg) {
                return { run: async () => ({ changes: 1 }) };
              }
              return { run: async () => ({ changes: 0 }) };
            },
          };
        }
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({}),
            all: async () => ({ results: [] }),
            run: async () => ({ changes: 1 }),
          }),
        };
      },
    } as unknown as D1Database,
    SESSION_KV: {
      get: async (key: string) => {
        if (key === `token_${userA.user_id}`) return userA;
        if (key === `token_${userB.user_id}`) return userB;
        if (key === `token_${superAdminA.user_id}`) return superAdminA;
        return null;
      },
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    RATE_LIMIT_KV: {
      get: async () => null,
      put: async () => {},
    } as unknown as KVNamespace,
    CHALLENGE_KV: {
      get: async () => null,
      put: async () => {},
    } as unknown as KVNamespace,
  };
}

function withUser(user: { user_id: string; organization_id: string; role: string }) {
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

describe('members routes — cross-tenant IDOR and privilege guards', () => {
  const defaultEnv = createMockEnv();

  it('returns 404 when updating role of user from another org', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${userB.user_id}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ role: 'admin' }),
    }, defaultEnv);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user tries to modify their own role', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${userA.user_id}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ role: 'super_admin' }),
    }, defaultEnv);
    expect(res.status).toBe(403);
  });

  it('returns 403 when demoting the last active super_admin', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${superAdminA.user_id}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ role: 'admin' }),
    }, defaultEnv);
    expect(res.status).toBe(403);
  });

  it('allows demoting a super_admin when another super_admin exists', async () => {
    const env = createMockEnv({ superAdminCount: 2 });
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${superAdminA.user_id}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ role: 'admin' }),
    }, env);
    expect(res.status).toBe(200);
  });

  it('returns 404 when updating status of user from another org', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${userB.user_id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ status: 'suspended' }),
    }, defaultEnv);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user tries to modify their own status', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${userA.user_id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ status: 'suspended' }),
    }, defaultEnv);
    expect(res.status).toBe(403);
  });

  it('returns 403 when suspending the last active super_admin', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${superAdminA.user_id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ status: 'suspended' }),
    }, defaultEnv);
    expect(res.status).toBe(403);
  });

  it('allows suspending a super_admin when another super_admin exists', async () => {
    const env = createMockEnv({ superAdminCount: 2 });
    const app = new Hono();
    app.use('*', withRequestId());
    app.use('*', withUser(userA));
    app.route('/organizations/:orgId/members', membersRoutes);

    const res = await app.request(`/organizations/${orgA}/members/${superAdminA.user_id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer token_${userA.user_id}` },
      body: JSON.stringify({ status: 'suspended' }),
    }, env);
    expect(res.status).toBe(200);
  });
});
