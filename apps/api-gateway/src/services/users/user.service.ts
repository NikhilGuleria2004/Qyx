import { D1Database } from '@cloudflare/workers-types';
import { getUserById, getUserByEmail, listUsersByOrg, createUser as dbCreateUser, updateUserRole, updateUserStatus } from '../../db/queries/users';
import { CreateUser } from './user.schema';
import { User } from './user.types';

export class UserService {
  constructor(private db: D1Database) {}

  async getUser(userId: string): Promise<User | null> {
    const result = await getUserById(this.db, userId);
    return result as User | null;
  }

  async listUsers(organizationId: string, status?: string): Promise<User[]> {
    const results = await listUsersByOrg(this.db, organizationId, status);
    return results as unknown as User[];
  }

  async createUser(data: CreateUser, organizationId: string): Promise<User> {
    const existing = await getUserByEmail(this.db, organizationId, data.email);
    if (existing) {
      throw new Error('User with this email already exists in the organization');
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await dbCreateUser(this.db, userId, organizationId, data.email, data.display_name, data.role, data.public_key);

    return {
      id: userId,
      organization_id: organizationId,
      email: data.email,
      display_name: data.display_name,
      role: data.role,
      status: 'active',
      public_key: data.public_key,
      created_at: Date.now(),
      last_active_at: Date.now(),
    };
  }

  async updateUserRole(orgId: string, userId: string, role: string): Promise<void> {
    await updateUserRole(this.db, orgId, userId, role);
  }

  async updateUserStatus(orgId: string, userId: string, status: string): Promise<void> {
    await updateUserStatus(this.db, orgId, userId, status);
  }
}
