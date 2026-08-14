import { describe, it, expect } from 'vitest';
import { OrganizationSchema, UserSchema } from './index.ts';

describe('schemas', () => {
  it('validates organization', () => {
    const org = OrganizationSchema.parse({
      id: 'org_123',
      name: 'Acme',
      status: 'active',
      security_tier: 'standard',
      created_at: 1234567890,
    });
    expect(org.id).toBe('org_123');
  });

  it('validates user', () => {
    const user = UserSchema.parse({
      id: 'usr_123',
      organization_id: 'org_123',
      email: 'alice@acme.com',
      display_name: 'Alice',
      role: 'employee',
      status: 'active',
      created_at: 1234567890,
    });
    expect(user.email).toBe('alice@acme.com');
  });
});
