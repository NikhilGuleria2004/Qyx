import { describe, it, expect, beforeEach } from 'vitest';
import { InviteService } from './invite.service';

describe('InviteService', () => {
  let db: D1Database;
  let service: InviteService;
  let invites: Record<string, unknown>[];

  beforeEach(() => {
    invites = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM invites WHERE code = ?')) {
              return invites.find((i) => i.code === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM invites WHERE email = ?')) {
              return {
                results: invites.filter(
                  (i) => i.email === args[0] && i.status === args[1] && (i.expires_at as number) > (args[2] as number)
                ),
              };
            }
            if (sql.includes('SELECT * FROM invites WHERE organization_id = ?')) {
              return { results: invites.filter((i) => i.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO invites')) {
              invites.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                email: args[2] as string | null,
                code: args[3] as string,
                role: args[4] as string,
                status: args[5] as string,
                created_at: args[6] as number,
                expires_at: args[7] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE invites SET status')) {
              const idx = invites.findIndex((i) => i.id === args[1] && i.organization_id === args[2]);
              if (idx !== -1) {
                invites[idx] = { ...invites[idx], status: args[0] as string };
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new InviteService(db);
  });

  it('creates an invite with pending status and expiry', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    expect(invite.id.startsWith('inv_')).toBe(true);
    expect(invite.organization_id).toBe('org_123');
    expect(invite.email).toBe('user@example.com');
    expect(invite.role).toBe('employee');
    expect(invite.status).toBe('pending');
    expect(invite.code).toBeDefined();
    expect(invite.code.length).toBe(12);
    expect(invite.expires_at).toBeGreaterThan(Date.now());
  });

  it('creates an open invite without email', async () => {
    const invite = await service.createInvite('org_123', null, 'employee', 7);

    expect(invite.email).toBeNull();
    expect(invite.organization_id).toBe('org_123');
  });

  it('sets correct role on invite', async () => {
    const managerInvite = await service.createInvite('org_123', 'user@example.com', 'manager', 7);
    expect(managerInvite.role).toBe('manager');

    const adminInvite = await service.createInvite('org_123', 'admin@example.com', 'admin', 7);
    expect(adminInvite.role).toBe('admin');
  });

  it('calculates expiry based on ttl_days', async () => {
    const now = Date.now();
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 14);

    const expectedExpiry = now + 14 * 24 * 60 * 60 * 1000;
    expect(invite.expires_at).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(invite.expires_at).toBeLessThanOrEqual(expectedExpiry + 1000);
  });

  it('finds invite by code', async () => {
    const created = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    const found = await service.getInviteByCode(created.code);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.code).toBe(created.code);
  });

  it('returns null for non-existent code', async () => {
    const result = await service.getInviteByCode('NONEXISTENT');
    expect(result).toBeNull();
  });

  it('lists invites by organization', async () => {
    await service.createInvite('org_123', 'user1@example.com', 'employee', 7);
    await service.createInvite('org_123', 'user2@example.com', 'manager', 7);
    await service.createInvite('org_456', 'user3@example.com', 'employee', 7);

    const org123Invites = await service.getInvitesByOrg('org_123');
    expect(org123Invites.length).toBe(2);
    org123Invites.forEach((inv) => {
      expect(inv.organization_id).toBe('org_123');
    });
  });

  it('lists invites by email', async () => {
    await service.createInvite('org_123', 'user@example.com', 'employee', 7);
    await service.createInvite('org_456', 'user@example.com', 'manager', 7);

    const emailInvites = await service.getInvitesByEmail('user@example.com');
    expect(emailInvites.length).toBe(2);
  });

  it('does not list expired invites by email', async () => {
    invites.push({
      id: 'inv_old',
      organization_id: 'org_123',
      email: 'user@example.com',
      code: 'OLDCODE12345',
      role: 'employee',
      status: 'pending',
      created_at: Date.now() - 10 * 24 * 60 * 60 * 1000,
      expires_at: Date.now() - 1000,
    });

    const emailInvites = await service.getInvitesByEmail('user@example.com');
    expect(emailInvites.length).toBe(0);
  });

  it('accepts an invite and marks it as accepted', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    await service.acceptInvite('org_123', invite.id);

    const accepted = invites.find((i) => i.id === invite.id);
    expect(accepted!.status).toBe('accepted');
  });

  it('revokes an invite', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    await service.revokeInvite('org_123', invite.id);

    const revoked = invites.find((i) => i.id === invite.id);
    expect(revoked!.status).toBe('revoked');
  });

  it('does not accept invite from different org', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    await service.acceptInvite('org_456', invite.id);

    const unchanged = invites.find((i) => i.id === invite.id);
    expect(unchanged!.status).toBe('pending');
  });

  it('does not revoke invite from different org', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    await service.revokeInvite('org_456', invite.id);

    const unchanged = invites.find((i) => i.id === invite.id);
    expect(unchanged!.status).toBe('pending');
  });

  it('invite is single-use (accepted invites cannot be reused)', async () => {
    const invite = await service.createInvite('org_123', 'user@example.com', 'employee', 7);

    await service.acceptInvite('org_123', invite.id);

    const accepted = await service.getInviteByCode(invite.code);
    expect(accepted!.status).toBe('accepted');
  });
});
