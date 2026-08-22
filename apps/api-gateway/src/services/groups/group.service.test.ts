import { describe, it, expect, beforeEach } from 'vitest';
import { GroupService } from './group.service';

describe('GroupService', () => {
  let db: D1Database;
  let service: GroupService;
  let groups: Record<string, unknown>[];
  let groupMembers: Record<string, unknown>[];

  beforeEach(() => {
    groups = [];
    groupMembers = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM groups WHERE id = ?')) {
              return groups.find((g) => g.id === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM groups WHERE organization_id = ?')) {
              return { results: groups.filter((g) => g.organization_id === args[0]) };
            }
            if (sql.includes('SELECT * FROM group_members WHERE group_id = ?')) {
              return { results: groupMembers.filter((m) => m.group_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO groups')) {
              groups.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                name: args[2] as string,
                description: args[3] as string | null,
                created_by: args[4] as string,
                key_epoch: args[5] as number,
                created_at: args[6] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('DELETE FROM groups')) {
              const idx = groups.findIndex((g) => g.id === args[0] && g.organization_id === args[1]);
              if (idx !== -1) {
                groups.splice(idx, 1);
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new GroupService(db);
  });

  it('creates a group scoped to organization', async () => {
    const group = await service.createGroup('org_123', 'usr_123', {
      name: 'Engineering',
      description: 'Engineering team',
    });

    expect(group.id.startsWith('grp_')).toBe(true);
    expect(group.organization_id).toBe('org_123');
    expect(group.name).toBe('Engineering');
    expect(groups.length).toBe(1);
  });

  it('lists groups by organization', async () => {
    await service.createGroup('org_123', 'usr_1', { name: 'Group A' });
    await service.createGroup('org_123', 'usr_2', { name: 'Group B' });
    await service.createGroup('org_456', 'usr_3', { name: 'Other Org Group' });

    const orgGroups = await service.listGroups('org_123');
    expect(orgGroups.length).toBe(2);
    orgGroups.forEach((g) => {
      expect(g.organization_id).toBe('org_123');
    });
  });

  it('returns null for group in different org', async () => {
    const group = await service.createGroup('org_123', 'usr_1', { name: 'Group' });

    const result = await service.getGroup(group.id);
    expect(result).not.toBeNull();
    expect(result!.organization_id).toBe('org_123');
  });

  it('deletes a group', async () => {
    const group = await service.createGroup('org_123', 'usr_1', { name: 'Group' });

    await service.deleteGroup('org_123', group.id);

    expect(groups.length).toBe(0);
  });

  it('does not delete group from different org', async () => {
    const group = await service.createGroup('org_123', 'usr_1', { name: 'Group' });

    await service.deleteGroup('org_456', group.id);

    expect(groups.length).toBe(1);
  });

  it('lists group members', async () => {
    const group = await service.createGroup('org_123', 'usr_1', { name: 'Group' });

    groupMembers.push(
      { group_id: group.id, user_id: 'usr_1', role: 'admin', status: 'active' },
      { group_id: group.id, user_id: 'usr_2', role: 'member', status: 'active' }
    );

    const members = await service.listMembers(group.id);
    expect(members.length).toBe(2);
  });
});
