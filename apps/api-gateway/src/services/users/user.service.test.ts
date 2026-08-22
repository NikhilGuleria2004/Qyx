import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from './user.service';

describe('UserService', () => {
  let db: D1Database;
  let service: UserService;
  let users: Record<string, unknown>[];

  beforeEach(() => {
    users = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT id, organization_id, email, display_name, role, status, public_key, created_at, last_active_at FROM users WHERE id = ?')) {
              return users.find((u) => u.id === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM users WHERE organization_id = ? AND email = ?')) {
              return users.find((u) => u.organization_id === args[0] && u.email === args[1]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM users WHERE organization_id = ?')) {
              return { results: users.filter((u) => u.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO users')) {
              users.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                email: args[2] as string,
                display_name: args[3] as string,
                role: args[4] as string,
                status: args[5] as string,
                public_key: args[6] as string | null,
                created_at: args[7] as number,
                last_active_at: args[8] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE users SET role')) {
              const user = users.find((u) => u.id === args[1] && u.organization_id === args[2]);
              if (user) user.role = args[0];
              return { changes: 1 };
            }
            if (sql.includes('UPDATE users SET status')) {
              const user = users.find((u) => u.id === args[1] && u.organization_id === args[2]);
              if (user) user.status = args[0];
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new UserService(db);
  });

  it('gets user by id', async () => {
    users.push({
      id: 'usr_123',
      organization_id: 'org_123',
      email: 'user@example.com',
      display_name: 'Test User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
      last_active_at: Date.now(),
    });

    const result = await service.getUser('usr_123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('usr_123');
  });

  it('returns null for non-existent user', async () => {
    const result = await service.getUser('usr_nonexistent');
    expect(result).toBeNull();
  });

  it('lists users by organization', async () => {
    users.push(
      { id: 'usr_1', organization_id: 'org_123', email: 'user1@example.com', display_name: 'User 1', role: 'employee', status: 'active', created_at: Date.now() },
      { id: 'usr_2', organization_id: 'org_123', email: 'user2@example.com', display_name: 'User 2', role: 'admin', status: 'active', created_at: Date.now() },
      { id: 'usr_3', organization_id: 'org_456', email: 'user3@example.com', display_name: 'User 3', role: 'employee', status: 'active', created_at: Date.now() }
    );

    const orgUsers = await service.listUsers('org_123');
    expect(orgUsers.length).toBe(2);
    orgUsers.forEach((u) => {
      expect(u.organization_id).toBe('org_123');
    });
  });

  it('creates a user in organization', async () => {
    const user = await service.createUser(
      { email: 'new@example.com', display_name: 'New User', role: 'employee' },
      'org_123'
    );

    expect(user.id.startsWith('usr_')).toBe(true);
    expect(user.organization_id).toBe('org_123');
    expect(user.email).toBe('new@example.com');
    expect(user.status).toBe('active');
  });

  it('rejects duplicate email in same organization', async () => {
    users.push({
      id: 'usr_1',
      organization_id: 'org_123',
      email: 'existing@example.com',
      display_name: 'Existing',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    await expect(
      service.createUser({ email: 'existing@example.com', display_name: 'New', role: 'employee' }, 'org_123')
    ).rejects.toThrow('User with this email already exists in the organization');
  });

  it('allows same email in different organization', async () => {
    users.push({
      id: 'usr_1',
      organization_id: 'org_123',
      email: 'user@example.com',
      display_name: 'User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    const user = await service.createUser({ email: 'user@example.com', display_name: 'User', role: 'employee' }, 'org_456');
    expect(user.organization_id).toBe('org_456');
  });

  it('updates user role scoped to organization', async () => {
    users.push({
      id: 'usr_123',
      organization_id: 'org_123',
      email: 'user@example.com',
      display_name: 'User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    await service.updateUserRole('org_123', 'usr_123', 'manager');

    const user = users.find((u) => u.id === 'usr_123');
    expect(user!.role).toBe('manager');
  });

  it('does not update role for user in different org', async () => {
    users.push({
      id: 'usr_123',
      organization_id: 'org_456',
      email: 'user@example.com',
      display_name: 'User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    await service.updateUserRole('org_123', 'usr_123', 'manager');

    const user = users.find((u) => u.id === 'usr_123');
    expect(user!.role).toBe('employee');
  });

  it('updates user status scoped to organization', async () => {
    users.push({
      id: 'usr_123',
      organization_id: 'org_123',
      email: 'user@example.com',
      display_name: 'User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    await service.updateUserStatus('org_123', 'usr_123', 'suspended');

    const user = users.find((u) => u.id === 'usr_123');
    expect(user!.status).toBe('suspended');
  });

  it('does not update status for user in different org', async () => {
    users.push({
      id: 'usr_123',
      organization_id: 'org_456',
      email: 'user@example.com',
      display_name: 'User',
      role: 'employee',
      status: 'active',
      created_at: Date.now(),
    });

    await service.updateUserStatus('org_123', 'usr_123', 'suspended');

    const user = users.find((u) => u.id === 'usr_123');
    expect(user!.status).toBe('active');
  });
});
