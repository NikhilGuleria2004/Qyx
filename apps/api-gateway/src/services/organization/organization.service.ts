import { D1Database } from '@cloudflare/workers-types';
import { getOrganizationById, createOrganization, updateOrgSecurityPolicy } from '../../db/queries/organizations';
import { getDomainByName, createDomain, updateDomainVerification, listDomainsByOrg } from '../../db/queries/domains';
import { CreateOrganization, AddDomain, UpdateOrgSettings } from './organization.schema';
import { Organization, Domain } from './organization.types';

export class OrganizationService {
  constructor(private db: D1Database) {}

  async createOrganization(data: CreateOrganization, _creatorId: string): Promise<Organization> {
    const orgId = `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await createOrganization(this.db, orgId, data.name);
    
    const domainName = data.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const existingDomain = await getDomainByName(this.db, domainName);
    
    if (existingDomain && existingDomain.verified) {
      await this.db.prepare('UPDATE organizations SET status = ? WHERE id = ?').bind('active', orgId).run();
    } else {
      await this.db.prepare('UPDATE organizations SET status = ? WHERE id = ?').bind('pending_verification', orgId).run();
    }

    return {
      id: orgId,
      name: data.name,
      status: 'pending_verification',
      security_tier: 'standard',
      created_at: Date.now(),
    };
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    const result = await getOrganizationById(this.db, orgId);
    return result as Organization | null;
  }

  async addDomain(orgId: string, data: AddDomain): Promise<Domain> {
    const domainName = data.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const existing = await getDomainByName(this.db, domainName);
    
    if (existing && existing.organization_id !== orgId) {
      throw new Error('Domain already belongs to another organization');
    }

    const domainId = `dom_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const verificationToken = `qyx-verify=${crypto.randomUUID().replace(/-/g, '')}`;
    
    await createDomain(this.db, domainId, orgId, domainName, verificationToken);
    
    return {
      id: domainId,
      organization_id: orgId,
      domain: domainName,
      verified: false,
      verification_token: verificationToken,
      created_at: Date.now(),
    };
  }

  async verifyDomain(orgId: string, domainId: string, txtRecord: string): Promise<Domain> {
    const domain = await this.db.prepare('SELECT * FROM domains WHERE id = ? AND organization_id = ?').bind(domainId, orgId).first() as Domain;
    
    if (!domain) {
      throw new Error('Domain not found');
    }

    const expectedToken = domain.verification_token || '';
    const isValid = txtRecord.includes(expectedToken) || txtRecord === expectedToken;
    
    await updateDomainVerification(this.db, domainId, isValid);
    
    if (isValid) {
      await this.db.prepare('UPDATE organizations SET status = ? WHERE id = ?').bind('active', orgId).run();
    }
    
    return {
      ...domain,
      verified: isValid,
    };
  }

  async listDomains(orgId: string): Promise<Domain[]> {
    const results = await listDomainsByOrg(this.db, orgId);
    return results as unknown as Domain[];
  }

  async updateSettings(orgId: string, data: UpdateOrgSettings): Promise<void> {
    if (data.recovery_policy && data.recovery_policy !== 'device_only') {
      throw new Error('Recovery policy enterprise_key and user_backup are not yet implemented');
    }

    await updateOrgSecurityPolicy(this.db, orgId, data);
  }
}
