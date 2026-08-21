import { describe, it, expect } from 'vitest';
import { bucketOf, ROLE_HOME_PATH, can } from './lib/roles';

describe('route decisions', () => {
  it('redirects authenticated user to role home', () => {
    const role = 'admin';
    const bucket = bucketOf(role);
    const path = ROLE_HOME_PATH[bucket];
    expect(path).toBe('/admin');
  });

  it('denies employee from members:write', () => {
    expect(can('employee', 'members:write')).toBe(false);
  });

  it('allows admin to members:write', () => {
    expect(can('admin', 'members:write')).toBe(true);
  });
});
