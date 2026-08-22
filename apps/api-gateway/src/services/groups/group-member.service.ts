import { D1Database } from '@cloudflare/workers-types';
import { getGroupMember, getGroupMembers, createGroupMember, updateGroupMemberStatus, deleteGroupMember, incrementGroupKeyEpoch } from '../../db/queries/group-members';

export class GroupMemberService {
  constructor(private db: D1Database) {}

  private async getGroupOrgId(groupId: string): Promise<string | null> {
    const group = await this.db.prepare('SELECT organization_id FROM groups WHERE id = ?').bind(groupId).first();
    return group ? (group as { organization_id: string }).organization_id : null;
  }

  async requestToJoin(groupId: string, userId: string, orgId: string): Promise<void> {
    const groupOrgId = await this.getGroupOrgId(groupId);
    if (!groupOrgId || groupOrgId !== orgId) {
      throw new Error('Group not found');
    }
    const existing = await getGroupMember(this.db, groupId, userId);
    if (existing) {
      const member = existing as { status: string };
      if (member.status === 'active') {
        throw new Error('Already a member of this group');
      }
      if (member.status === 'pending') {
        throw new Error('Join request already pending');
      }
    }

    await createGroupMember(this.db, groupId, userId, 'member', 'pending');
  }

  async listPendingRequests(groupId: string, orgId: string) {
    const groupOrgId = await this.getGroupOrgId(groupId);
    if (!groupOrgId || groupOrgId !== orgId) {
      throw new Error('Group not found');
    }
    const members = await getGroupMembers(this.db, groupId, 'pending');
    return members;
  }

  async approveRequest(groupId: string, userId: string, orgId: string, _approverId: string): Promise<{ key_epoch: number }> {
    const groupOrgId = await this.getGroupOrgId(groupId);
    if (!groupOrgId || groupOrgId !== orgId) {
      throw new Error('Group not found');
    }
    const member = await getGroupMember(this.db, groupId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData || memberData.status !== 'pending') {
      throw new Error('No pending request found');
    }

    await updateGroupMemberStatus(this.db, groupId, userId, 'active');
    await incrementGroupKeyEpoch(this.db, groupId);

    const group = await this.db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind(groupId).first();
    const groupData = group as { key_epoch: number } | undefined;

    return {
      key_epoch: groupData?.key_epoch ?? 1,
    };
  }

  async rejectRequest(groupId: string, userId: string, orgId: string): Promise<void> {
    const groupOrgId = await this.getGroupOrgId(groupId);
    if (!groupOrgId || groupOrgId !== orgId) {
      throw new Error('Group not found');
    }
    const member = await getGroupMember(this.db, groupId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData || memberData.status !== 'pending') {
      throw new Error('No pending request found');
    }

    await deleteGroupMember(this.db, groupId, userId);
  }

  async removeMember(groupId: string, userId: string, orgId: string): Promise<{ key_epoch: number }> {
    const groupOrgId = await this.getGroupOrgId(groupId);
    if (!groupOrgId || groupOrgId !== orgId) {
      throw new Error('Group not found');
    }
    const member = await getGroupMember(this.db, groupId, userId);
    const memberData = member as { status: string } | undefined;

    if (!memberData) {
      throw new Error('Member not found');
    }

    if (memberData.status === 'removed') {
      throw new Error('Member already removed');
    }

    await updateGroupMemberStatus(this.db, groupId, userId, 'removed');
    await incrementGroupKeyEpoch(this.db, groupId);

    const group = await this.db.prepare('SELECT key_epoch FROM groups WHERE id = ?').bind(groupId).first();
    const groupData = group as { key_epoch: number } | undefined;

    return {
      key_epoch: groupData?.key_epoch ?? 1,
    };
  }
}
