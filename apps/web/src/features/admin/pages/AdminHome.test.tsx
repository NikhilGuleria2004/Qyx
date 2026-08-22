import { describe, it, expect } from 'vitest';
import { ADMIN_NAV_ITEMS, can } from '../../../lib/roles';

describe('AdminHome role-based nav trimming (Phase 6)', () => {
  it('manager sees only manager-permitted nav items', () => {
    const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can('manager', item.permission));
    const labels = quickLinks.map((item) => item.label);

    expect(labels).toContain('Members');
    expect(labels).toContain('Groups');
    expect(labels).toContain('Channels');
    expect(labels).toContain('Requests');

    expect(labels).not.toContain('Org Settings');
    expect(labels).not.toContain('Security Center');
    expect(labels).not.toContain('Audit Log');
    expect(labels).not.toContain('Devices');
    expect(labels).not.toContain('SSO');
    expect(labels).not.toContain('Alerts');
  });

  it('security_admin sees members, requests, security, audit, devices', () => {
    const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can('security_admin', item.permission));
    const labels = quickLinks.map((item) => item.label);

    expect(labels).toContain('Members');
    expect(labels).toContain('Audit Log');
    expect(labels).toContain('Devices');
    expect(labels).toContain('Security Center');
    expect(labels).toContain('Alerts');
    expect(labels).toContain('Requests');

    expect(labels).not.toContain('Groups');
    expect(labels).not.toContain('Channels');
    expect(labels).not.toContain('Org Settings');
    expect(labels).not.toContain('SSO');
  });

  it('admin sees all nav items except devices', () => {
    const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can('admin', item.permission));
    const labels = quickLinks.map((item) => item.label);

    expect(labels).toContain('Members');
    expect(labels).toContain('Groups');
    expect(labels).toContain('Channels');
    expect(labels).toContain('Requests');
    expect(labels).toContain('Org Settings');
    expect(labels).toContain('Security Center');
    expect(labels).toContain('Audit Log');
    expect(labels).toContain('SSO');
    expect(labels).toContain('Alerts');

    expect(labels).not.toContain('Devices');
  });

  it('employee sees only requests', () => {
    const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can('employee', item.permission));
    const labels = quickLinks.map((item) => item.label);

    expect(labels).toContain('Requests');
    expect(labels).toHaveLength(1);
  });

  it('super_admin sees all nav items', () => {
    const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can('super_admin', item.permission));
    const labels = quickLinks.map((item) => item.label);

    expect(labels).toHaveLength(ADMIN_NAV_ITEMS.length);
  });
});
