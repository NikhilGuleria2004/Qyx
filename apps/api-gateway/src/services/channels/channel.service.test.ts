import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelService } from './channel.service';

describe('ChannelService', () => {
  let db: D1Database;
  let service: ChannelService;
  let channels: Record<string, unknown>[];
  let channelMembers: Record<string, unknown>[];

  beforeEach(() => {
    channels = [];
    channelMembers = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT organization_id FROM channels WHERE id = ?')) {
              const ch = channels.find((c) => c.id === args[0]);
              return ch ? { organization_id: ch.organization_id } : null;
            }
            if (sql.includes('SELECT * FROM channels WHERE id = ?')) {
              return channels.find((c) => c.id === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')) {
              return channelMembers.find((m) => m.channel_id === args[0] && m.user_id === args[1]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM channels WHERE organization_id = ?')) {
              return { results: channels.filter((c) => c.organization_id === args[0]) };
            }
            if (sql.includes('SELECT * FROM channel_members WHERE channel_id = ? AND status = ?')) {
              return { results: channelMembers.filter((m) => m.channel_id === args[0] && m.status === args[1]) };
            }
            if (sql.includes('SELECT * FROM channel_members WHERE channel_id = ?')) {
              return { results: channelMembers.filter((m) => m.channel_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO channels')) {
              channels.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                name: args[2] as string,
                description: args[3] as string | null,
                created_by: args[4] as string,
                created_at: args[5] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('DELETE FROM channels')) {
              const idx = channels.findIndex((c) => c.id === args[0] && c.organization_id === args[1]);
              if (idx !== -1) {
                channels.splice(idx, 1);
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            if (sql.includes('INSERT INTO channel_members')) {
              channelMembers.push({
                channel_id: args[0] as string,
                user_id: args[1] as string,
                can_post: args[2] as number,
                status: args[3] as string,
                requested_at: args[4] as number,
                joined_at: args[5] as number | null,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE channel_members SET status')) {
              const idx = channelMembers.findIndex((m) => m.channel_id === args[3] && m.user_id === args[4]);
              if (idx !== -1) {
                channelMembers[idx] = {
                  ...channelMembers[idx],
                  status: args[0] as string,
                  can_post: args[1] as number,
                  joined_at: args[2] as number,
                };
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            if (sql.includes('DELETE FROM channel_members')) {
              const idx = channelMembers.findIndex((m) => m.channel_id === args[0] && m.user_id === args[1]);
              if (idx !== -1) {
                channelMembers.splice(idx, 1);
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new ChannelService(db);
  });

  it('creates a channel scoped to organization', async () => {
    const channel = await service.createChannel('org_123', 'usr_123', {
      name: 'general',
      description: 'General discussion',
    });

    expect(channel.id.startsWith('chn_')).toBe(true);
    expect(channel.organization_id).toBe('org_123');
    expect(channel.name).toBe('general');
  });

  it('lists channels by organization', async () => {
    await service.createChannel('org_123', 'usr_1', { name: 'general' });
    await service.createChannel('org_123', 'usr_2', { name: 'random' });
    await service.createChannel('org_456', 'usr_3', { name: 'other' });

    const orgChannels = await service.listChannels('org_123');
    expect(orgChannels.length).toBe(2);
  });

  it('prevents requesting to join channel in different org', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await expect(
      service.requestToJoin(channel.id, 'usr_456', 'org_456')
    ).rejects.toThrow('Channel not found');
  });

  it('allows requesting to join channel in same org', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await service.requestToJoin(channel.id, 'usr_456', 'org_123');

    expect(channelMembers.length).toBe(1);
    expect(channelMembers[0].status).toBe('pending');
  });

  it('prevents duplicate join requests', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await service.requestToJoin(channel.id, 'usr_456', 'org_123');

    await expect(
      service.requestToJoin(channel.id, 'usr_456', 'org_123')
    ).rejects.toThrow('Join request already pending');
  });

  it('approves a join request', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await service.requestToJoin(channel.id, 'usr_456', 'org_123');

    const result = await service.approveRequest(channel.id, 'usr_456', 'org_123', true);

    expect(result.status).toBe('active');
    expect(result.can_post).toBe(true);

    const member = channelMembers.find((m) => m.user_id === 'usr_456');
    expect(member!.status).toBe('active');
  });

  it('rejects a join request', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await service.requestToJoin(channel.id, 'usr_456', 'org_123');

    await service.rejectRequest(channel.id, 'usr_456', 'org_123');

    expect(channelMembers.length).toBe(0);
  });

  it('prevents approving request for channel in different org', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    channelMembers.push({
      channel_id: channel.id,
      user_id: 'usr_456',
      can_post: 0,
      status: 'pending',
      requested_at: Date.now(),
      joined_at: null,
    });

    await expect(
      service.approveRequest(channel.id, 'usr_456', 'org_456', false)
    ).rejects.toThrow('Channel not found');
  });

  it('lists pending requests', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await service.requestToJoin(channel.id, 'usr_456', 'org_123');
    await service.requestToJoin(channel.id, 'usr_789', 'org_123');

    const requests = await service.listPendingRequests(channel.id, 'org_123');
    expect(requests.length).toBe(2);
  });

  it('removes a member', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    channelMembers.push({
      channel_id: channel.id,
      user_id: 'usr_456',
      can_post: 1,
      status: 'active',
      requested_at: Date.now(),
      joined_at: Date.now(),
    });

    await service.removeMember(channel.id, 'usr_456', 'org_123');

    expect(channelMembers.length).toBe(0);
  });

  it('lists active channel members', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    channelMembers.push(
      { channel_id: channel.id, user_id: 'usr_1', status: 'active' },
      { channel_id: channel.id, user_id: 'usr_2', status: 'active' },
      { channel_id: channel.id, user_id: 'usr_3', status: 'pending' }
    );

    const activeMembers = await service.getChannelMembersList(channel.id, 'org_123');
    expect(activeMembers.length).toBe(2);
  });

  it('prevents ackPost for non-members', async () => {
    const channel = await service.createChannel('org_123', 'usr_1', { name: 'general' });

    await expect(
      service.ackPost(channel.id, 'post_1', 'usr_999', 'org_123')
    ).rejects.toThrow('Not a channel member');
  });
});
