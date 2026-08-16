import { describe, it, expect } from 'vitest';
import { GroupMemberService } from './group-member.service';

describe('group-member service', () => {
  it('requests to join a group', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => undefined,
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    await service.requestToJoin('grp_1', 'usr_1');
    // Should not throw
  });

  it('prevents duplicate pending requests', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({ status: 'pending' }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    await expect(service.requestToJoin('grp_1', 'usr_1')).rejects.toThrow('Join request already pending');
  });

  it('approves a pending request and increments key epoch', async () => {
    let keyEpoch = 1;
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT key_epoch FROM groups')) {
              return { key_epoch: keyEpoch };
            }
            if (_sql.includes('SELECT * FROM group_members')) {
              return { status: 'pending' };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.includes('UPDATE groups SET key_epoch')) {
              keyEpoch++;
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    const result = await service.approveRequest('grp_1', 'usr_1', 'admin_1');
    expect(result.key_epoch).toBe(2);
  });

  it('rejects a pending request', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({ status: 'pending' }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    await service.rejectRequest('grp_1', 'usr_1');
    // Should not throw
  });

  it('removes an active member and increments key epoch', async () => {
    let keyEpoch = 1;
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT key_epoch FROM groups')) {
              return { key_epoch: ++keyEpoch };
            }
            if (_sql.includes('SELECT * FROM group_members')) {
              return { status: 'active' };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    const result = await service.removeMember('grp_1', 'usr_1');
    expect(result.key_epoch).toBe(2);
  });

  it('prevents removing an already removed member', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({ status: 'removed' }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    await expect(service.removeMember('grp_1', 'usr_1')).rejects.toThrow('Member already removed');
  });

  it('throws when removing a non-existent member', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => undefined,
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    await expect(service.removeMember('grp_1', 'usr_1')).rejects.toThrow('Member not found');
  });

  it('increments key epoch on removal so removed member cannot decrypt post-removal messages', async () => {
    let keyEpoch = 1;
    let memberStatus: string | undefined = 'pending';
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT key_epoch FROM groups')) {
              return { key_epoch: keyEpoch };
            }
            if (_sql.includes('SELECT * FROM group_members')) {
              return memberStatus ? { status: memberStatus } : undefined;
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.includes('UPDATE groups SET key_epoch')) {
              keyEpoch++;
            }
            if (_sql.includes('UPDATE group_members SET status')) {
              memberStatus = _args[0] as string;
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);
    const before = await service.approveRequest('grp_1', 'usr_1', 'admin_1');
    expect(before.key_epoch).toBe(2);

    const after = await service.removeMember('grp_1', 'usr_1');
    expect(after.key_epoch).toBe(3);

    const group = await db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind('grp_1').first();
    const groupData = group as { key_epoch: number } | undefined;
    expect(groupData?.key_epoch).toBe(3);
  });
});
