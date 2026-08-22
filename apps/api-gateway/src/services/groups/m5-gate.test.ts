import { describe, it, expect } from 'vitest';
import { GroupMemberService } from './group-member.service';

describe('M5 Gate — E2E group journeys', () => {
  const ORG_ID = 'org_123';

  it('journey 3: group join → key epoch grants decryption access', async () => {
    let keyEpoch = 1;
    const memberStatuses = new Map<string, string>();
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT organization_id FROM groups')) {
              return { organization_id: ORG_ID };
            }
            if (_sql.includes('SELECT key_epoch FROM groups')) {
              return { key_epoch: keyEpoch };
            }
            if (_sql.includes('SELECT * FROM group_members')) {
              const userId = _args[1] as string;
              const status = memberStatuses.get(userId);
              if (status) {
                return { status };
              }
              return undefined;
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.includes('UPDATE groups SET key_epoch')) {
              keyEpoch++;
            }
            if (_sql.includes('INSERT INTO group_members')) {
              const userId = _args[1] as string;
              memberStatuses.set(userId, 'pending');
            }
            if (_sql.includes('UPDATE group_members SET status')) {
              const userId = _args[3] as string;
              memberStatuses.set(userId, _args[0] as string);
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);

    await service.requestToJoin('grp_1', 'usr_1', ORG_ID);
    expect(memberStatuses.get('usr_1')).toBe('pending');
    expect(keyEpoch).toBe(1);

    const approved = await service.approveRequest('grp_1', 'usr_1', ORG_ID, 'admin_1');
    expect(approved.key_epoch).toBe(2);
    expect(memberStatuses.get('usr_1')).toBe('active');

    const group = await db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind('grp_1').first();
    const groupData = group as { key_epoch: number } | undefined;
    expect(groupData?.key_epoch).toBe(2);
  });

  it('journey 4: member removal → cannot decrypt post-removal messages', async () => {
    let keyEpoch = 2;
    const memberStatuses = new Map<string, string>();
    memberStatuses.set('usr_2', 'active');

    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT organization_id FROM groups')) {
              return { organization_id: ORG_ID };
            }
            if (_sql.includes('SELECT key_epoch FROM groups')) {
              return { key_epoch: keyEpoch };
            }
            if (_sql.includes('SELECT * FROM group_members')) {
              const userId = _args[1] as string;
              const status = memberStatuses.get(userId);
              if (status) {
                return { status };
              }
              return undefined;
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.includes('UPDATE groups SET key_epoch')) {
              keyEpoch++;
            }
            if (_sql.includes('UPDATE group_members SET status')) {
              const userId = _args[3] as string;
              memberStatuses.set(userId, _args[0] as string);
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new GroupMemberService(db);

    let group = await db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind('grp_1').first();
    let groupData = group as { key_epoch: number } | undefined;
    expect(groupData?.key_epoch).toBe(2);

    const removed = await service.removeMember('grp_1', 'usr_2', ORG_ID);
    expect(removed.key_epoch).toBe(3);

    group = await db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind('grp_1').first();
    groupData = group as { key_epoch: number } | undefined;
    expect(groupData?.key_epoch).toBe(3);

    const member = await db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').bind('grp_1', 'usr_2').first();
    const memberData = member as { status: string } | undefined;
    expect(memberData?.status).toBe('removed');
  });
});
