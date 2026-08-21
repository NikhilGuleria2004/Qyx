import { describe, it, expect } from 'vitest';
import { bucketOf, ROLE_BUCKET, ROLE_HOME_PATH, ROLE_LABEL, BUCKET_LABEL, can } from '../lib/roles';

describe('roles', () => {
  it('bucketOf maps backend roles to buckets', () => {
    expect(bucketOf('super_admin')).toBe('superadmin');
    expect(bucketOf('admin')).toBe('admin');
    expect(bucketOf('manager')).toBe('admin');
    expect(bucketOf('security_admin')).toBe('admin');
    expect(bucketOf('employee')).toBe('employee');
  });

  it('bucketOf falls back to employee for unknown roles', () => {
    expect(bucketOf(undefined)).toBe('employee');
    expect(bucketOf(null)).toBe('employee');
    expect(bucketOf('unknown_role')).toBe('employee');
    expect(bucketOf('')).toBe('employee');
  });

  it('ROLE_BUCKET mirrors bucketOf', () => {
    expect(ROLE_BUCKET.super_admin).toBe('superadmin');
    expect(ROLE_BUCKET.admin).toBe('admin');
    expect(ROLE_BUCKET.manager).toBe('admin');
    expect(ROLE_BUCKET.security_admin).toBe('admin');
    expect(ROLE_BUCKET.employee).toBe('employee');
  });

  it('ROLE_HOME_PATH has correct paths', () => {
    expect(ROLE_HOME_PATH.superadmin).toBe('/superadmin');
    expect(ROLE_HOME_PATH.admin).toBe('/admin');
    expect(ROLE_HOME_PATH.employee).toBe('/employee');
  });

  it('ROLE_LABEL has readable names', () => {
    expect(ROLE_LABEL.super_admin).toBe('Super Admin');
    expect(ROLE_LABEL.admin).toBe('Admin');
    expect(ROLE_LABEL.manager).toBe('Manager');
    expect(ROLE_LABEL.security_admin).toBe('Security Admin');
    expect(ROLE_LABEL.employee).toBe('Employee');
  });

  it('BUCKET_LABEL has readable names', () => {
    expect(BUCKET_LABEL.superadmin).toBe('Super Admin');
    expect(BUCKET_LABEL.admin).toBe('Admin');
    expect(BUCKET_LABEL.employee).toBe('Employee');
  });

  it('can grants wildcard to super_admin', () => {
    expect(can('super_admin', 'any:permission')).toBe(true);
    expect(can('super_admin', 'members:write')).toBe(true);
    expect(can('super_admin', 'org:delete')).toBe(true);
  });

  it('can checks specific permissions for other roles', () => {
    expect(can('admin', 'members:read')).toBe(true);
    expect(can('admin', 'members:write')).toBe(true);
    expect(can('admin', 'audit:read')).toBe(true);
    expect(can('admin', 'devices:write')).toBe(false);

    expect(can('employee', 'conversations:read')).toBe(true);
    expect(can('employee', 'members:read')).toBe(false);
    expect(can('employee', 'org:read')).toBe(true);

    expect(can('manager', 'groups:write')).toBe(true);
    expect(can('manager', 'channels:write')).toBe(false);
  });

  it('can returns false for unknown roles', () => {
    expect(can('unknown_role', 'members:read')).toBe(false);
    expect(can(null, 'members:read')).toBe(false);
    expect(can(undefined, 'members:read')).toBe(false);
  });
});
