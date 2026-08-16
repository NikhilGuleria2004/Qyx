import { D1Database } from '@cloudflare/workers-types';
import { getGroupById, getGroupsByOrg, createGroup as dbCreateGroup, deleteGroup as dbDeleteGroup } from '../../db/queries/groups';
import { CreateGroup } from './group.schema';
import { Group } from './group.types';

export class GroupService {
  constructor(private db: D1Database) {}

  async createGroup(organizationId: string, createdBy: string, data: CreateGroup): Promise<Group> {
    const groupId = `grp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await dbCreateGroup(this.db, groupId, organizationId, data.name, data.description || null, createdBy);

    const created = await getGroupById(this.db, groupId);
    return created as unknown as Group;
  }

  async listGroups(organizationId: string): Promise<Group[]> {
    const groups = await getGroupsByOrg(this.db, organizationId);
    return groups as unknown as Group[];
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const group = await getGroupById(this.db, groupId);
    return group as unknown as Group | null;
  }

  async deleteGroup(groupId: string): Promise<void> {
    await dbDeleteGroup(this.db, groupId);
  }
}
