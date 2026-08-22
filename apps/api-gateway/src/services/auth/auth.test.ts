import { describe, it, expect } from 'vitest';
import { AuthService } from './auth.service';

function createMockDb(overrides: {
  orgByName?: { id: string; name: string; status: string } | null;
  domains?: Array<{ id: string; domain: string; verified: number }>;
  inviteByCode?: { id: string; organization_id: string; status: string; expires_at: number; role: string } | null;
  userByEmail?: { id: string; organization_id: string; email: string; display_name: string; role: string } | null;
} = {}) {
  const {
    orgByName = null,
    domains = [],
    inviteByCode = null,
    userByEmail = null,
  } = overrides;

  let insertedUser: Record<string, unknown> | null = null;

  return {
    _insertedUser: insertedUser,
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT * FROM organizations WHERE name')) {
            return orgByName;
          }
          if (sql.includes('SELECT * FROM invites WHERE code')) {
            return inviteByCode;
          }
          if (sql.includes('SELECT * FROM users WHERE organization_id = ? AND email')) {
            return userByEmail;
          }
          if (sql.includes('SELECT * FROM domains WHERE organization_id')) {
            return domains.length > 0 ? domains[0] : null;
          }
          return undefined;
        },
        all: async () => {
          if (sql.includes('SELECT * FROM domains WHERE organization_id')) {
            return { results: domains };
          }
          return { results: [] };
        },
        run: async () => {
          if (sql.startsWith('INSERT INTO users')) {
            insertedUser = { id: _args[0], organization_id: _args[1], email: _args[2], display_name: _args[3], role: _args[4] };
          }
          if (sql.startsWith('INSERT INTO organizations')) {
            return { changes: 1 };
          }
          if (sql.startsWith('UPDATE invites SET status')) {
            return { changes: 1 };
          }
          return { changes: 1 };
        },
      }),
    }),
  } as unknown as D1Database & { _insertedUser: Record<string, unknown> | null };
}

describe('AuthService.register — tenant isolation (Phase 4)', () => {
  it('rejects registration with existing org name when no invite code and non-matching email domain', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      domains: [{ id: 'dom_1', domain: 'existingcorp.com', verified: 1 }],
      userByEmail: null,
    });

    const service = new AuthService(db);
    await expect(
      service.register({
        email: 'attacker@evil.com',
        password: 'password123',
        display_name: 'Attacker',
        organization_name: 'Existing Corp',
        domain: 'evil.com',
      }),
    ).rejects.toThrow('ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN');
  });

  it('rejects registration with existing org name when no invite code and org has no verified domains', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      domains: [],
      userByEmail: null,
    });

    const service = new AuthService(db);
    await expect(
      service.register({
        email: 'anyone@example.com',
        password: 'password123',
        display_name: 'Anyone',
        organization_name: 'Existing Corp',
        domain: 'example.com',
      }),
    ).rejects.toThrow('ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN');
  });

  it('accepts registration with existing org name when email domain matches verified org domain', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      domains: [{ id: 'dom_1', domain: 'existingcorp.com', verified: 1 }],
      userByEmail: { id: 'usr_new', organization_id: 'org_existing', email: 'newhire@existingcorp.com', display_name: 'New Hire', role: 'employee' },
    });

    const service = new AuthService(db);
    const result = await service.register({
      email: 'newhire@existingcorp.com',
      password: 'password123',
      display_name: 'New Hire',
      organization_name: 'Existing Corp',
      domain: 'existingcorp.com',
    });

    expect(result.user).toBeDefined();
    expect(result.user.organization_id).toBe('org_existing');
    expect(result.user.role).toBe('employee');
    expect(result.orgCreated).toBe(false);
  });

  it('accepts registration with valid invite code for existing org and uses invite-specified role', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      inviteByCode: { id: 'inv_1', organization_id: 'org_existing', status: 'pending', expires_at: Date.now() + 86400000, role: 'manager' },
      userByEmail: { id: 'usr_invited', organization_id: 'org_existing', email: 'manager@existingcorp.com', display_name: 'Invited Manager', role: 'manager' },
    });

    const service = new AuthService(db);
    const result = await service.register({
      email: 'manager@existingcorp.com',
      password: 'password123',
      display_name: 'Invited Manager',
      organization_name: 'Existing Corp',
      domain: 'existingcorp.com',
      invite_code: 'ABC123',
    });

    expect(result.user).toBeDefined();
    expect(result.user.organization_id).toBe('org_existing');
    expect(result.user.role).toBe('manager');
    expect(result.orgCreated).toBe(false);
  });

  it('rejects registration with invalid invite code for existing org', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      inviteByCode: null,
      userByEmail: null,
    });

    const service = new AuthService(db);
    await expect(
      service.register({
        email: 'user@example.com',
        password: 'password123',
        display_name: 'User',
        organization_name: 'Existing Corp',
        domain: 'example.com',
        invite_code: 'INVALIDCODE',
      }),
    ).rejects.toThrow('Invalid or expired invite code');
  });

  it('rejects registration with expired invite code for existing org and non-matching domain', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      inviteByCode: { id: 'inv_1', organization_id: 'org_existing', status: 'pending', expires_at: Date.now() - 1000, role: 'employee' },
      domains: [{ id: 'dom_1', domain: 'existingcorp.com', verified: 1 }],
      userByEmail: null,
    });

    const service = new AuthService(db);
    await expect(
      service.register({
        email: 'user@other.com',
        password: 'password123',
        display_name: 'User',
        organization_name: 'Existing Corp',
        domain: 'other.com',
        invite_code: 'EXPIRED',
      }),
    ).rejects.toThrow('Invalid or expired invite code');
  });

  it('creates new org as super_admin when org name does not exist', async () => {
    const db = createMockDb({
      orgByName: null,
      userByEmail: { id: 'usr_creator', organization_id: 'org_new', email: 'creator@newcorp.com', display_name: 'Creator', role: 'super_admin' },
    });

    const service = new AuthService(db);
    const result = await service.register({
      email: 'creator@newcorp.com',
      password: 'password123',
      display_name: 'Creator',
      organization_name: 'Brand New Corp',
      domain: 'newcorp.com',
    });

    expect(result.user).toBeDefined();
    expect(result.user.role).toBe('super_admin');
    expect(result.orgCreated).toBe(true);
  });

  it('rejects registration with existing org name and unverified email domain', async () => {
    const db = createMockDb({
      orgByName: { id: 'org_existing', name: 'Existing Corp', status: 'active' },
      domains: [{ id: 'dom_1', domain: 'existingcorp.com', verified: 0 }],
      userByEmail: null,
    });

    const service = new AuthService(db);
    await expect(
      service.register({
        email: 'person@existingcorp.com',
        password: 'password123',
        display_name: 'Person',
        organization_name: 'Existing Corp',
        domain: 'existingcorp.com',
      }),
    ).rejects.toThrow('ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN');
  });
});
