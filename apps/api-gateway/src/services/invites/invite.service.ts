import { D1Database } from '@cloudflare/workers-types';
import { createInvite, getInviteByCode, getInvitesByEmail, getInvitesByOrg, acceptInvite, revokeInvite } from '../../db/queries/invites';

export interface Invite {
  id: string;
  organization_id: string;
  email: string | null;
  code: string;
  role: string;
  status: string;
  created_at: number;
  expires_at: number;
}

export class InviteService {
  constructor(private db: D1Database) {}

  async createInvite(organizationId: string, email: string | null, role: string, ttlDays: number = 7): Promise<Invite> {
    const id = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;

    await createInvite(this.db, id, organizationId, email, code, role, expiresAt);

    return {
      id,
      organization_id: organizationId,
      email,
      code,
      role,
      status: 'pending',
      created_at: Date.now(),
      expires_at: expiresAt,
    };
  }

  async getInviteByCode(code: string): Promise<Invite | null> {
    const result = await getInviteByCode(this.db, code);
    if (!result) return null;
    return result as Invite;
  }

  async getInvitesByEmail(email: string): Promise<Invite[]> {
    const results = await getInvitesByEmail(this.db, email);
    return results as Invite[];
  }

  async getInvitesByOrg(organizationId: string): Promise<Invite[]> {
    const results = await getInvitesByOrg(this.db, organizationId);
    return results as Invite[];
  }

  async acceptInvite(orgId: string, inviteId: string): Promise<void> {
    await acceptInvite(this.db, orgId, inviteId);
  }

  async revokeInvite(orgId: string, inviteId: string): Promise<void> {
    await revokeInvite(this.db, orgId, inviteId);
  }
}
