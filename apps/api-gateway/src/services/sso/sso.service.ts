import { D1Database } from '@cloudflare/workers-types';
import { AuditService } from '../audit/audit.service';
import { createSession } from '../auth/session';
import { listDomainsByOrg } from '../../db/queries/domains';
import { CreateSsoProvider, UpdateSsoProvider } from './sso.schema';

type SsoProvider = {
  id: string;
  organization_id: string;
  provider_type: string;
  provider_name: string;
  issuer_url: string | null;
  client_id: string;
  client_secret: string;
  authorization_url: string | null;
  token_url: string | null;
  userinfo_url: string | null;
  jwks_url: string | null;
  attribute_mapping: string;
  enabled: number;
  created_at: number;
};

export class SsoService {
  constructor(private db: D1Database) {}

  async createProvider(orgId: string, data: CreateSsoProvider): Promise<SsoProvider> {
    const id = `sso_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    await this.db.prepare(
      `INSERT INTO sso_providers (id, organization_id, provider_type, provider_name, issuer_url, client_id, client_secret, authorization_url, token_url, userinfo_url, jwks_url, attribute_mapping, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      orgId,
      data.provider_type || 'oidc',
      data.provider_name,
      data.issuer_url || null,
      data.client_id,
      data.client_secret,
      data.authorization_url || null,
      data.token_url || null,
      data.userinfo_url || null,
      data.jwks_url || null,
      data.attribute_mapping || '{"email":"email","name":"name"}',
      1,
      now
    ).run();

    const provider = await this.getProvider(orgId, id);
    if (!provider) throw new Error('Failed to create SSO provider');
    return provider;
  }

  async listProviders(orgId: string): Promise<SsoProvider[]> {
    const result = await this.db.prepare('SELECT * FROM sso_providers WHERE organization_id = ? ORDER BY created_at DESC').bind(orgId).all();
    return result.results as unknown as SsoProvider[];
  }

  async getProvider(orgId: string, providerId: string): Promise<SsoProvider | null> {
    const result = await this.db.prepare('SELECT * FROM sso_providers WHERE id = ? AND organization_id = ?').bind(providerId, orgId).first();
    return result as unknown as SsoProvider | null;
  }

  async getProviderByName(orgId: string, providerName: string): Promise<SsoProvider | null> {
    const result = await this.db.prepare('SELECT * FROM sso_providers WHERE organization_id = ? AND provider_name = ? AND enabled = 1').bind(orgId, providerName).first();
    return result as unknown as SsoProvider | null;
  }

  async updateProvider(orgId: string, providerId: string, data: UpdateSsoProvider): Promise<SsoProvider | null> {
    const existing = await this.getProvider(orgId, providerId);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.provider_name !== undefined) { sets.push('provider_name = ?'); values.push(data.provider_name); }
    if (data.issuer_url !== undefined) { sets.push('issuer_url = ?'); values.push(data.issuer_url); }
    if (data.client_id !== undefined) { sets.push('client_id = ?'); values.push(data.client_id); }
    if (data.client_secret !== undefined) { sets.push('client_secret = ?'); values.push(data.client_secret); }
    if (data.authorization_url !== undefined) { sets.push('authorization_url = ?'); values.push(data.authorization_url); }
    if (data.token_url !== undefined) { sets.push('token_url = ?'); values.push(data.token_url); }
    if (data.userinfo_url !== undefined) { sets.push('userinfo_url = ?'); values.push(data.userinfo_url); }
    if (data.jwks_url !== undefined) { sets.push('jwks_url = ?'); values.push(data.jwks_url); }
    if (data.attribute_mapping !== undefined) { sets.push('attribute_mapping = ?'); values.push(data.attribute_mapping); }
    if (data.enabled !== undefined) { sets.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    if (sets.length === 0) return existing;

    values.push(providerId, orgId);
    await this.db.prepare(`UPDATE sso_providers SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`).bind(...values).run();

    return this.getProvider(orgId, providerId);
  }

  async deleteProvider(orgId: string, providerId: string): Promise<boolean> {
    await this.db.prepare('DELETE FROM sso_providers WHERE id = ? AND organization_id = ?').bind(providerId, orgId).run();
    return true;
  }

  buildAuthorizationUrl(provider: SsoProvider, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: provider.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });

    if (provider.authorization_url) {
      return `${provider.authorization_url}?${params.toString()}`;
    }

    throw new Error('Authorization URL not configured for provider');
  }

  async handleCallback(provider: SsoProvider, code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; display_name: string; organization_id: string; role: string } }> {
    if (!provider.token_url) {
      throw new Error('Token URL not configured for provider');
    }

    const tokenResponse = await fetch(provider.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.client_id,
        client_secret: provider.client_secret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; id_token?: string; expires_in: number };
    const accessToken = tokenData.access_token;

    let email: string = '';
    let name: string = '';

    if (provider.userinfo_url) {
      const userinfoResponse = await fetch(provider.userinfo_url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!userinfoResponse.ok) {
        throw new Error(`Userinfo request failed: ${userinfoResponse.status}`);
      }

      const userinfo = await userinfoResponse.json() as Record<string, unknown>;
      const mapping = JSON.parse(provider.attribute_mapping || '{}') as Record<string, string>;
      email = String(userinfo[mapping.email || 'email'] || '');
      name = String(userinfo[mapping.name || 'name'] || email);
    }

    if (!email) {
      throw new Error('Email not found in SSO assertion');
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) {
      throw new Error('Invalid email in SSO assertion');
    }

    const orgDomains = await listDomainsByOrg(this.db, provider.organization_id);
    const verifiedDomains = (orgDomains as Array<{ domain: string; verified: number }>)
      .filter((d) => d.verified === 1)
      .map((d) => d.domain.toLowerCase());

    if (verifiedDomains.length > 0 && !verifiedDomains.includes(emailDomain)) {
      throw new Error(`Email domain ${emailDomain} does not match any verified org domain`);
    }

    const userResult = await this.db.prepare('SELECT * FROM users WHERE organization_id = ? AND email = ?').bind(provider.organization_id, email).first();
    let user: { id: string; organization_id: string; role: string; email: string; display_name: string } | null = userResult as unknown as typeof user | null;

    if (!user) {
      const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await this.db.prepare(
        'INSERT INTO users (id, organization_id, email, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(userId, provider.organization_id, email, name || email, 'employee', 'active', Date.now()).run();

      user = {
        id: userId,
        organization_id: provider.organization_id,
        role: 'employee',
        email,
        display_name: name || email,
      };
    }

    const refreshToken = `rt_${crypto.randomUUID().replace(/-/g, '')}`;
    await createSession(this.db, user.id, user.organization_id, refreshToken);

    const audit = new AuditService(this.db);
    await audit.log({
      organization_id: provider.organization_id,
      actor_id: user.id,
      event_type: 'login_success',
      metadata: { email, sso_provider: provider.provider_name },
    });

    return {
      accessToken: crypto.randomUUID(),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        organization_id: user.organization_id,
        role: user.role,
      },
    };
  }
}
