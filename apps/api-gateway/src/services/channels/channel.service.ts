import { D1Database } from '@cloudflare/workers-types';
import { getChannelById, getChannelsByOrg, createChannel as dbCreateChannel, deleteChannel as dbDeleteChannel, getChannelMember, getChannelMembers, createChannelMember, updateChannelMemberStatus, deleteChannelMember } from '../../db/queries/channels';
import { CreateChannel } from './channel.schema';
import { Channel, ChannelMember } from './channel.types';

export class ChannelService {
  constructor(private db: D1Database) {}

  async createChannel(organizationId: string, createdBy: string, data: CreateChannel): Promise<Channel> {
    const channelId = `chn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await dbCreateChannel(this.db, channelId, organizationId, data.name, data.description || null, createdBy);

    const created = await getChannelById(this.db, channelId);
    return created as unknown as Channel;
  }

  async listChannels(organizationId: string): Promise<Channel[]> {
    const channels = await getChannelsByOrg(this.db, organizationId);
    return channels as unknown as Channel[];
  }

  async getChannel(channelId: string): Promise<Channel | null> {
    const channel = await getChannelById(this.db, channelId);
    return channel as unknown as Channel | null;
  }

  async deleteChannel(organizationId: string, channelId: string): Promise<void> {
    await dbDeleteChannel(this.db, organizationId, channelId);
  }

  async requestToJoin(channelId: string, userId: string): Promise<void> {
    const existing = await getChannelMember(this.db, channelId, userId);
    if (existing) {
      const member = existing as { status: string };
      if (member.status === 'active') {
        throw new Error('Already a member of this channel');
      }
      if (member.status === 'pending') {
        throw new Error('Join request already pending');
      }
    }

    await createChannelMember(this.db, channelId, userId, false, 'pending');
  }

  async listPendingRequests(channelId: string) {
    const members = await getChannelMembers(this.db, channelId, 'pending');
    return members;
  }

  async approveRequest(channelId: string, userId: string, canPost: boolean = false): Promise<{ status: string; can_post: boolean }> {
    const member = await getChannelMember(this.db, channelId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData || memberData.status !== 'pending') {
      throw new Error('No pending request found');
    }

    await updateChannelMemberStatus(this.db, channelId, userId, 'active', canPost);

    return {
      status: 'active',
      can_post: canPost,
    };
  }

  async rejectRequest(channelId: string, userId: string): Promise<void> {
    const member = await getChannelMember(this.db, channelId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData || memberData.status !== 'pending') {
      throw new Error('No pending request found');
    }

    await deleteChannelMember(this.db, channelId, userId);
  }

  async ackPost(channelId: string, postId: string, userId: string, _reaction?: string): Promise<void> {
    const member = await getChannelMember(this.db, channelId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData || memberData.status !== 'active') {
      throw new Error('Not a channel member');
    }

    // In a full implementation, this would create/update an ack record
    // For now, we just verify membership
  }

  async getChannelMembersList(channelId: string): Promise<ChannelMember[]> {
    const members = await getChannelMembers(this.db, channelId, 'active');
    return members as unknown as ChannelMember[];
  }

  async listMembers(channelId: string): Promise<ChannelMember[]> {
    const members = await getChannelMembers(this.db, channelId);
    return members as unknown as ChannelMember[];
  }

  async removeMember(channelId: string, userId: string): Promise<void> {
    const member = await getChannelMember(this.db, channelId, userId);
    if (!member) {
      throw new Error('Member not found');
    }
    await deleteChannelMember(this.db, channelId, userId);
  }
}
