import { describe, it, expect } from 'vitest';
import { CreateOrganizationSchema, AddDomainSchema, VerifyDomainSchema } from './organization.schema';

describe('organization schemas', () => {
  it('validates create organization', () => {
    const result = CreateOrganizationSchema.parse({ name: 'Acme Corp', domain: 'acme.com' });
    expect(result.name).toBe('Acme Corp');
  });

  it('rejects empty name', () => {
    expect(() => CreateOrganizationSchema.parse({ name: '', domain: 'acme.com' })).toThrow();
  });

  it('validates add domain', () => {
    const result = AddDomainSchema.parse({ domain: 'acme.com' });
    expect(result.domain).toBe('acme.com');
  });

  it('validates verify domain', () => {
    const result = VerifyDomainSchema.parse({ txt_record: 'qyx-verify=abc123' });
    expect(result.txt_record).toBe('qyx-verify=abc123');
  });
});
