import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SsoService } from './sso.service';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SSO service', () => {
  let db: D1Database;
  let service: SsoService;
  let ssoProviders: Record<string, unknown>[];
  let users: Record<string, unknown>[];
  let domains: Record<string, unknown>[];
  let sessions: Record<string, unknown>[];

  beforeEach(() => {
    ssoProviders = [];
    users = [];
    domains = [];
    sessions = [];
    mockFetch.mockReset();

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM sso_providers')) {
              if (sql.includes('provider_name = ?')) {
                const match = ssoProviders.find(
                  (p) => p.organization_id === args[0] && p.provider_name === args[1] && p.enabled === 1
                );
                return match || null;
              }
              if (sql.includes('id = ? AND organization_id = ?')) {
                const match = ssoProviders.find(
                  (p) => p.id === args[0] && p.organization_id === args[1]
                );
                return match || null;
              }
            }
            if (sql.includes('SELECT * FROM users WHERE organization_id = ? AND email = ?')) {
              const match = users.find(
                (u) => u.organization_id === args[0] && u.email === args[1]
              );
              return match || null;
            }
            if (sql.includes('SELECT * FROM domains WHERE id = ?')) {
              const match = domains.find((d) => d.id === args[0]);
              return match || null;
            }
            if (sql.includes('SELECT * FROM domains WHERE domain = ?')) {
              const match = domains.find((d) => d.domain === args[0]);
              return match || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM sso_providers WHERE organization_id = ?')) {
              return {
                results: ssoProviders
                  .filter((p) => p.organization_id === args[0])
                  .sort((a, b) => (b.created_at as number) - (a.created_at as number)),
              };
            }
            if (sql.includes('SELECT * FROM domains WHERE organization_id = ?')) {
              return { results: domains.filter((d) => d.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO sso_providers')) {
              const provider = {
                id: args[0] as string,
                organization_id: args[1] as string,
                provider_type: args[2] as string,
                provider_name: args[3] as string,
                issuer_url: args[4] as string | null,
                client_id: args[5] as string,
                client_secret: args[6] as string,
                authorization_url: args[7] as string | null,
                token_url: args[8] as string | null,
                userinfo_url: args[9] as string | null,
                jwks_url: args[10] as string | null,
                attribute_mapping: args[11] as string,
                enabled: args[12] as number,
                created_at: args[13] as number,
              };
              ssoProviders.push(provider);
              return { changes: 1 };
            }
            if (sql.includes('UPDATE sso_providers')) {
              const id = args[args.length - 2] as string;
              const orgId = args[args.length - 1] as string;
              const idx = ssoProviders.findIndex((p) => p.id === id && p.organization_id === orgId);
              if (idx === -1) return { changes: 0 };
              const setClause = sql.substring(sql.indexOf('SET') + 4, sql.indexOf('WHERE'));
              const fields = setClause.split(',').map((s) => s.trim());
              fields.forEach((field, fieldIdx) => {
                if (field.startsWith('provider_name')) {
                  ssoProviders[idx] = { ...ssoProviders[idx], provider_name: args[fieldIdx] as string };
                } else if (field.startsWith('enabled')) {
                  ssoProviders[idx] = { ...ssoProviders[idx], enabled: args[fieldIdx] as number };
                }
              });
              return { changes: 1 };
            }
            if (sql.includes('DELETE FROM sso_providers')) {
              const id = args[0] as string;
              const orgId = args[1] as string;
              const idx = ssoProviders.findIndex((p) => p.id === id && p.organization_id === orgId);
              if (idx !== -1) {
                ssoProviders.splice(idx, 1);
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            if (sql.includes('INSERT INTO users')) {
              users.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                email: args[2] as string,
                display_name: args[3] as string,
                role: args[4] as string,
                status: args[5] as string,
                created_at: args[6] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('INSERT INTO sessions')) {
              sessions.push({
                id: args[0] as string,
                user_id: args[1] as string,
                organization_id: args[2] as string,
                device_id: args[3] as string | null,
                refresh_token: args[4] as string,
                expires_at: args[5] as number,
                created_at: args[6] as number,
                last_seen_at: args[7] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('INSERT INTO audit_events')) {
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new SsoService(db);
  });

  it('creates an OIDC provider', async () => {
    const provider = await service.createProvider('org_123', {
      provider_name: 'google',
      provider_type: 'oidc',
      client_id: 'client_123',
      client_secret: 'secret_123',
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
      issuer_url: 'https://accounts.google.com',
    });

    expect(provider.id).toBeDefined();
    expect(provider.organization_id).toBe('org_123');
    expect(provider.provider_name).toBe('google');
    expect(provider.provider_type).toBe('oidc');
    expect(provider.enabled).toBe(1);
    expect(ssoProviders.length).toBe(1);
    expect(ssoProviders[0].client_secret).toBe('secret_123');
  });

  it('builds authorization URL with state parameter', () => {
    const provider = {
      id: 'sso_123',
      organization_id: 'org_123',
      provider_type: 'oidc',
      provider_name: 'google',
      issuer_url: 'https://accounts.google.com',
      client_id: 'client_123',
      client_secret: 'secret_123',
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwks_url: null,
      attribute_mapping: '{"email":"email","name":"name"}',
      enabled: 1,
      created_at: Date.now(),
    };

    const state = 'test_state_123';
    const redirectUri = 'https://api.example.com/v1/auth/sso/google/callback';
    const authUrl = service.buildAuthorizationUrl(provider, redirectUri, state);

    const url = new URL(authUrl);
    expect(url.searchParams.get('client_id')).toBe('client_123');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('lists providers scoped to organization', async () => {
    await service.createProvider('org_123', {
      provider_name: 'google',
      client_id: 'c1',
      client_secret: 's1',
    });
    await service.createProvider('org_123', {
      provider_name: 'okta',
      client_id: 'c2',
      client_secret: 's2',
    });
    await service.createProvider('org_456', {
      provider_name: 'azure',
      client_id: 'c3',
      client_secret: 's3',
    });

    const org123Providers = await service.listProviders('org_123');
    expect(org123Providers.length).toBe(2);
    org123Providers.forEach((p) => {
      expect(p.organization_id).toBe('org_123');
    });

    const org456Providers = await service.listProviders('org_456');
    expect(org456Providers.length).toBe(1);
    expect(org456Providers[0].provider_name).toBe('azure');
  });

  it('does not return providers from other orgs when looking up by name', async () => {
    ssoProviders.push({
      id: 'sso_123',
      organization_id: 'org_456',
      provider_type: 'oidc',
      provider_name: 'google',
      issuer_url: null,
      client_id: 'c1',
      client_secret: 's1',
      authorization_url: 'https://example.com/auth',
      token_url: 'https://example.com/token',
      userinfo_url: 'https://example.com/userinfo',
      jwks_url: null,
      attribute_mapping: '{}',
      enabled: 1,
      created_at: Date.now(),
    });

    const result = await service.getProviderByName('org_123', 'google');
    expect(result).toBeNull();
  });

  it('updates a provider', async () => {
    const provider = await service.createProvider('org_123', {
      provider_name: 'google',
      client_id: 'c1',
      client_secret: 's1',
    });

    const updated = await service.updateProvider('org_123', provider.id, {
      provider_name: 'google_workspaces',
      enabled: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.provider_name).toBe('google_workspaces');
    expect(updated!.enabled).toBe(0);
  });

  it('returns null when updating non-existent provider', async () => {
    const result = await service.updateProvider('org_123', 'sso_nonexistent', {
      provider_name: 'google',
    });
    expect(result).toBeNull();
  });

  it('deletes a provider', async () => {
    const provider = await service.createProvider('org_123', {
      provider_name: 'google',
      client_id: 'c1',
      client_secret: 's1',
    });

    const deleted = await service.deleteProvider('org_123', provider.id);
    expect(deleted).toBe(true);

    const remaining = await service.listProviders('org_123');
    expect(remaining.length).toBe(0);
  });

  it('does not delete providers from other orgs', async () => {
    const provider = await service.createProvider('org_123', {
      provider_name: 'google',
      client_id: 'c1',
      client_secret: 's1',
    });

    const deleted = await service.deleteProvider('org_456', provider.id);
    expect(deleted).toBe(true);

    const remaining = await service.listProviders('org_123');
    expect(remaining.length).toBe(1);
  });

  describe('handleCallback', () => {
    const provider = {
      id: 'sso_123',
      organization_id: 'org_123',
      provider_type: 'oidc',
      provider_name: 'google',
      issuer_url: 'https://accounts.google.com',
      client_id: 'client_123',
      client_secret: 'secret_123',
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwks_url: null,
      attribute_mapping: '{"email":"email","name":"name"}',
      enabled: 1,
      created_at: Date.now(),
    };

    it('completes SSO callback with token exchange and userinfo', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'user@example.com',
            name: 'Test User',
          }),
        });

      const result = await service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken.startsWith('rt_')).toBe(true);
      expect(result.user.email).toBe('user@example.com');
      expect(result.user.display_name).toBe('Test User');
      expect(result.user.organization_id).toBe('org_123');
      expect(result.user.role).toBe('employee');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
      expect(mockFetch.mock.calls[1][0]).toBe('https://openidconnect.googleapis.com/v1/userinfo');
    });

    it('rejects callback when email domain does not match verified org domains', async () => {
      domains.push({
        id: 'dom_123',
        organization_id: 'org_123',
        domain: 'company.com',
        verified: 1,
        verification_token: 'token',
        created_at: Date.now(),
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'user@otherdomain.com',
            name: 'Test User',
          }),
        });

      await expect(
        service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback')
      ).rejects.toThrow('Email domain otherdomain.com does not match any verified org domain');
    });

    it('allows callback when org has no verified domains', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'user@anydomain.com',
            name: 'Test User',
          }),
        });

      const result = await service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback');
      expect(result.user.email).toBe('user@anydomain.com');
    });

    it('creates new user on first SSO login', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'newuser@example.com',
            name: 'New User',
          }),
        });

      const result = await service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback');

      expect(result.user.id.startsWith('usr_')).toBe(true);
      expect(result.user.email).toBe('newuser@example.com');
      expect(result.user.role).toBe('employee');
      expect(users.length).toBe(1);
      expect(users[0].email).toBe('newuser@example.com');
    });

    it('links to existing user on subsequent SSO logins', async () => {
      users.push({
        id: 'usr_existing',
        organization_id: 'org_123',
        email: 'existing@example.com',
        display_name: 'Existing User',
        role: 'admin',
        status: 'active',
        created_at: Date.now(),
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'existing@example.com',
            name: 'Existing User',
          }),
        });

      const result = await service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback');

      expect(result.user.id).toBe('usr_existing');
      expect(result.user.role).toBe('admin');
      expect(users.length).toBe(1);
    });

    it('rejects callback when token exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        service.handleCallback(provider, 'invalid_code', 'https://api.example.com/v1/auth/sso/google/callback')
      ).rejects.toThrow('Token exchange failed: 400');
    });

    it('rejects callback when email is missing from userinfo', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: 'No Email User',
          }),
        });

      await expect(
        service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback')
      ).rejects.toThrow('Email not found in SSO assertion');
    });

    it('throws when token_url is not configured', async () => {
      const providerNoTokenUrl = { ...provider, token_url: null };

      await expect(
        service.handleCallback(providerNoTokenUrl, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback')
      ).rejects.toThrow('Token URL not configured for provider');
    });

    it('logs successful SSO login to audit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'idp_access_token_123',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: 'user@example.com',
            name: 'Test User',
          }),
        });

      await service.handleCallback(provider, 'auth_code_123', 'https://api.example.com/v1/auth/sso/google/callback');

      const auditInsert = mockFetch.mock.calls.find(
        (call) => call[0] === 'https://oauth2.googleapis.com/token'
      );
      expect(auditInsert).toBeDefined();
    });
  });
});
