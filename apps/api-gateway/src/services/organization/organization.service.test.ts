import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  let db: D1Database;
  let service: OrganizationService;
  let organizations: Record<string, unknown>[];
  let domains: Record<string, unknown>[];
  let securityPolicies: Record<string, unknown>[];

  beforeEach(() => {
    organizations = [];
    domains = [];
    securityPolicies = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM organizations WHERE id = ?')) {
              return organizations.find((o) => o.id === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM organizations WHERE name = ?')) {
              return organizations.find((o) => o.name === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM domains WHERE id = ? AND organization_id = ?')) {
              return domains.find((d) => d.id === args[0] && d.organization_id === args[1]) || null;
            }
            if (sql.includes('SELECT * FROM domains WHERE domain = ?')) {
              return domains.find((d) => d.domain === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM org_security_policy WHERE organization_id = ?')) {
              return securityPolicies.find((p) => p.organization_id === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM domains WHERE organization_id = ?')) {
              return { results: domains.filter((d) => d.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO organizations')) {
              organizations.push({
                id: args[0] as string,
                name: args[1] as string,
                status: args[2] as string,
                security_tier: args[3] as string,
                created_at: args[4] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE organizations SET status')) {
              const org = organizations.find((o) => o.id === args[1]);
              if (org) org.status = args[0];
              return { changes: 1 };
            }
            if (sql.includes('INSERT INTO org_security_policy')) {
              securityPolicies.push({
                organization_id: args[0] as string,
                mfa_required_roles: args[1] as string,
                allowed_file_types: args[2] as string,
                max_file_size_mb: args[3] as number,
                external_sharing: args[4] as number,
                notification_preview: args[5] as number,
                recovery_policy: args[6] as string,
              });
              return { changes: 1 };
            }
            if (sql.includes('INSERT INTO domains')) {
              domains.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                domain: args[2] as string,
                verified: 0,
                verification_token: args[3] as string,
                created_at: args[4] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE domains SET verified')) {
              const domain = domains.find((d) => d.id === args[1]);
              if (domain) domain.verified = args[0] ? 1 : 0;
              return { changes: 1 };
            }
            if (sql.includes('UPDATE org_security_policy')) {
              const policy = securityPolicies.find((p) => p.organization_id === args[args.length - 1]);
              if (policy) {
                const setClause = sql.substring(sql.indexOf('SET') + 4, sql.indexOf('WHERE'));
                const fields = setClause.split(',').map((s) => s.trim());
                fields.forEach((field, fieldIdx) => {
                  if (field.startsWith('allowed_file_types')) {
                    policy.allowed_file_types = args[fieldIdx] as string;
                  } else if (field.startsWith('max_file_size_mb')) {
                    policy.max_file_size_mb = args[fieldIdx] as number;
                  } else if (field.startsWith('external_sharing')) {
                    policy.external_sharing = args[fieldIdx] as number;
                  }
                });
              }
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new OrganizationService(db);
  });

  it('creates an organization with pending verification', async () => {
    const org = await service.createOrganization({ name: 'Acme Corp', domain: 'acme.com' }, 'usr_1');

    expect(org.id.startsWith('org_')).toBe(true);
    expect(org.name).toBe('Acme Corp');
    expect(organizations.length).toBe(1);
    expect(securityPolicies.length).toBe(1);
  });

  it('gets organization by id', async () => {
    organizations.push({ id: 'org_123', name: 'Acme', status: 'active', created_at: Date.now() });

    const result = await service.getOrganization('org_123');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Acme');
  });

  it('returns null for non-existent organization', async () => {
    const result = await service.getOrganization('org_nonexistent');
    expect(result).toBeNull();
  });

  it('adds a domain to organization', async () => {
    const domain = await service.addDomain('org_123', { domain: 'acme.com' });

    expect(domain.id.startsWith('dom_')).toBe(true);
    expect(domain.organization_id).toBe('org_123');
    expect(domain.domain).toBe('acme.com');
    expect(domain.verified).toBe(false);
    expect(domain.verification_token).toContain('qyx-verify=');
  });

  it('rejects domain belonging to another organization', async () => {
    domains.push({
      id: 'dom_456',
      organization_id: 'org_456',
      domain: 'acme.com',
      verified: 0,
      verification_token: 'token',
      created_at: Date.now(),
    });

    await expect(
      service.addDomain('org_123', { domain: 'acme.com' })
    ).rejects.toThrow('Domain already belongs to another organization');
  });

  it('verifies domain with correct TXT record', async () => {
    domains.push({
      id: 'dom_123',
      organization_id: 'org_123',
      domain: 'acme.com',
      verified: 0,
      verification_token: 'qyx-verify=abc123',
      created_at: Date.now(),
    });

    const result = await service.verifyDomain('org_123', 'dom_123', 'qyx-verify=abc123');
    expect(result.verified).toBe(true);
  });

  it('rejects domain verification with incorrect TXT record', async () => {
    domains.push({
      id: 'dom_123',
      organization_id: 'org_123',
      domain: 'acme.com',
      verified: 0,
      verification_token: 'qyx-verify=abc123',
      created_at: Date.now(),
    });

    const result = await service.verifyDomain('org_123', 'dom_123', 'wrong-token');
    expect(result.verified).toBe(false);
  });

  it('throws when verifying non-existent domain', async () => {
    await expect(
      service.verifyDomain('org_123', 'dom_nonexistent', 'token')
    ).rejects.toThrow('Domain not found');
  });

  it('lists domains by organization', async () => {
    domains.push(
      { id: 'dom_1', organization_id: 'org_123', domain: 'acme.com', verified: 1, verification_token: 't1', created_at: Date.now() },
      { id: 'dom_2', organization_id: 'org_123', domain: 'acme.io', verified: 0, verification_token: 't2', created_at: Date.now() },
      { id: 'dom_3', organization_id: 'org_456', domain: 'other.com', verified: 1, verification_token: 't3', created_at: Date.now() }
    );

    const orgDomains = await service.listDomains('org_123');
    expect(orgDomains.length).toBe(2);
    orgDomains.forEach((d) => {
      expect(d.organization_id).toBe('org_123');
    });
  });

  it('updates organization settings', async () => {
    securityPolicies.push({
      organization_id: 'org_123',
      mfa_required_roles: 'super_admin,admin',
      allowed_file_types: 'pdf,docx',
      max_file_size_mb: 500,
      external_sharing: 0,
      notification_preview: 0,
      recovery_policy: 'device_only',
    });

    await service.updateSettings('org_123', {
      allowed_file_types: 'pdf,docx,xlsx',
      max_file_size_mb: 1000,
    });

    const policy = securityPolicies.find((p) => p.organization_id === 'org_123');
    expect(policy!.allowed_file_types).toBe('pdf,docx,xlsx');
    expect(policy!.max_file_size_mb).toBe(1000);
  });

  it('rejects unimplemented recovery policies', async () => {
    await expect(
      service.updateSettings('org_123', { recovery_policy: 'enterprise_key' })
    ).rejects.toThrow('Recovery policy enterprise_key and user_backup are not yet implemented');
  });

  it('normalizes domain names when adding', async () => {
    const domain = await service.addDomain('org_123', { domain: 'https://Acme.COM/path' });
    expect(domain.domain).toBe('acme.com');
  });
});
