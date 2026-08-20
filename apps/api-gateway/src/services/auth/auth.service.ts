import { D1Database } from '@cloudflare/workers-types';
import { getUserByEmail, createUser as dbCreateUser } from '../../db/queries/users';
import { getOrganizationByName, createOrganization as dbCreateOrganization } from '../../db/queries/organizations';
import { createDomain as dbCreateDomain } from '../../db/queries/domains';
import { InviteService } from '../invites/invite.service';
import { hashPassword, verifyPassword } from './password';
import { generateTOTPSecret, verifyTOTP } from './totp';
import { createSession, getSessionByRefreshToken, deleteSession, updateSessionLastSeen, deleteUserSessions } from './session';
import { Register, Login } from './auth.schema';
import { User, LoginState } from './auth.types';

export class AuthService {
  constructor(private db: D1Database, private sessionKv?: KVNamespace) {}

  async register(data: Register): Promise<{ user: User; orgCreated: boolean }> {
    let organizationId: string;
    let orgCreated = false;
    let role = 'employee';

    if (data.invite_code) {
      const inviteService = new InviteService(this.db);
      const invite = await inviteService.getInviteByCode(data.invite_code.trim().toUpperCase());
      if (!invite || invite.status !== 'pending' || invite.expires_at < Date.now()) {
        throw new Error('Invalid or expired invite code');
      }
      organizationId = invite.organization_id;
      role = invite.role;
      await inviteService.acceptInvite(invite.id);
    } else {
      const existingOrg = await getOrganizationByName(this.db, data.organization_name);
      if (existingOrg) {
        organizationId = existingOrg.id as string;
      } else {
        organizationId = `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        await dbCreateOrganization(this.db, organizationId, data.organization_name);
        orgCreated = true;
        role = 'super_admin';
      }
    }

    if (orgCreated) {
      const domainName = data.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const domainId = `dom_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const verificationToken = `qyx-verify=${crypto.randomUUID().replace(/-/g, '')}`;
      await dbCreateDomain(this.db, domainId, organizationId, domainName, verificationToken);
    }

    const passwordHash = await hashPassword(data.password);
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await dbCreateUser(this.db, userId, organizationId, data.email, data.display_name, role, undefined, passwordHash);

    const user = await getUserByEmail(this.db, organizationId, data.email);
    if (!user) throw new Error('Failed to create user');

    return {
      user: user as unknown as User,
      orgCreated,
    };
  }

  async login(data: Login): Promise<{ state: LoginState; mfaSecret?: string }> {
    const user = await getUserByEmail(this.db, '', data.email);
    if (!user || !(user as { password_hash?: string }).password_hash) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await verifyPassword(data.password, (user as { password_hash: string }).password_hash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const role = ['super_admin', 'admin', 'manager', 'employee', 'security_admin'].includes((user as { role: string }).role) ? (user as { role: string }).role : 'employee';
    const mfaRequired = role === 'super_admin' || role === 'admin';

    if (mfaRequired && !(user as { mfa_secret?: string }).mfa_secret) {
      const mfaSecret = await generateTOTPSecret();
      await this.db.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 1 WHERE id = ?').bind(mfaSecret, (user as { id: string }).id).run();
      
      return {
        state: {
          state: 'MFA_CHALLENGE_ISSUED',
          userId: (user as { id: string }).id,
          organizationId: (user as { organization_id: string }).organization_id,
          role: (user as { role: string }).role,
          mfaRequired: true,
        },
        mfaSecret,
      };
    }

    if (mfaRequired && (user as { mfa_secret?: string }).mfa_secret) {
      return {
        state: {
          state: 'MFA_CHALLENGE_ISSUED',
          userId: (user as { id: string }).id,
          organizationId: (user as { organization_id: string }).organization_id,
          role: (user as { role: string }).role,
          mfaRequired: true,
        },
      };
    }

    return {
      state: {
        state: 'SESSION_ISSUED',
        userId: (user as { id: string }).id,
        organizationId: (user as { organization_id: string }).organization_id,
        role: (user as { role: string }).role,
      },
    };
  }

  async verifyMfa(userId: string, mfaCode: string): Promise<LoginState> {
    const user = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    if (!user || !(user as { mfa_secret?: string }).mfa_secret) {
      throw new Error('MFA not set up');
    }

    const valid = await verifyTOTP((user as { mfa_secret: string }).mfa_secret, mfaCode);
    if (!valid) {
      throw new Error('Invalid MFA code');
    }

    return {
      state: 'SESSION_ISSUED',
      userId: (user as { id: string }).id,
      organizationId: (user as { organization_id: string }).organization_id,
      role: (user as { role: string }).role,
    };
  }

  async issueSession(userId: string, organizationId: string, role: string, deviceId?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = crypto.randomUUID();
    const refreshToken = `rt_${crypto.randomUUID().replace(/-/g, '')}`;
    
    await createSession(this.db, userId, organizationId, refreshToken, deviceId);

    if (this.sessionKv) {
      await this.sessionKv.put(accessToken, JSON.stringify({
        user_id: userId,
        organization_id: organizationId,
        role,
        device_id: deviceId,
      }), { expirationTtl: 900 });
    }
    
    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshSession(refreshToken: string, oldAccessToken?: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    const session = await getSessionByRefreshToken(this.db, refreshToken);
    if (!session || (session as { expires_at: number }).expires_at < Date.now()) {
      return null;
    }

    await updateSessionLastSeen(this.db, (session as { id: string }).id);
    
    const newAccessToken = crypto.randomUUID();
    const newRefreshToken = `rt_${crypto.randomUUID().replace(/-/g, '')}`;
    
    const userId = (session as { user_id: string }).user_id;
    const organizationId = (session as { organization_id: string }).organization_id;
    const deviceId = (session as { device_id?: string }).device_id;

    const user = await this.db.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first() as { role: string } | null;
    const role = user?.role || 'employee';

    await deleteSession(this.db, refreshToken);
    await createSession(this.db, userId, organizationId, newRefreshToken, deviceId);

    if (this.sessionKv) {
      if (oldAccessToken) {
        await this.sessionKv.delete(oldAccessToken);
      }
      await this.sessionKv.put(newAccessToken, JSON.stringify({
        user_id: userId,
        organization_id: organizationId,
        role,
        device_id: deviceId,
      }), { expirationTtl: 900 });
    }
    
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(accessToken: string, userId?: string): Promise<void> {
    if (this.sessionKv && accessToken) {
      await this.sessionKv.delete(accessToken);
    }
    if (userId) {
      await deleteUserSessions(this.db, userId);
    } else {
      await deleteSession(this.db, accessToken);
    }
  }

  async getMe(userId: string): Promise<User | null> {
    const user = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return user as unknown as User | null;
  }
}
