export type BackendRole = 'super_admin' | 'admin' | 'manager' | 'employee' | 'security_admin';
export type RoleBucket = 'superadmin' | 'admin' | 'employee';

export const ROLE_BUCKET: Record<BackendRole, RoleBucket> = {
  super_admin: 'superadmin',
  admin: 'admin',
  manager: 'admin',
  security_admin: 'admin',
  employee: 'employee',
};

export const ROLE_HOME_PATH: Record<RoleBucket, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  employee: '/employee',
};

export const ROLE_LABEL: Record<BackendRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  security_admin: 'Security Admin',
  employee: 'Employee',
};

export const BUCKET_LABEL: Record<RoleBucket, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  employee: 'Employee',
};

export function bucketOf(role: string | undefined | null): RoleBucket {
  return ROLE_BUCKET[(role as BackendRole)] ?? 'employee';
}

// Mirrors apps/api-gateway/src/middleware/rbac.ts PERMISSIONS.
// Keep in sync manually until there's a shared @qyx/schemas export.
export const ROLE_PERMISSIONS: Record<BackendRole, string[]> = {
  super_admin: ['*'],
  admin: ['org:read','org:update','members:read','members:write','groups:read','groups:write','channels:read','channels:write','audit:read','security:read'],
  manager: ['org:read','members:read','groups:read','groups:write','channels:read'],
  employee: ['org:read','conversations:read','conversations:write','files:read','files:write'],
  security_admin: ['org:read','members:read','devices:read','devices:write','audit:read','security:read'],
};

export function can(role: string | undefined | null, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[(role as BackendRole)] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

export const ADMIN_NAV_ITEMS: { path: string; label: string; permission: string }[] = [
  { path: '/admin/members',  label: 'Members',        permission: 'members:read' },
  { path: '/admin/groups',   label: 'Groups',          permission: 'groups:read' },
  { path: '/admin/channels', label: 'Channels',        permission: 'channels:read' },
  { path: '/admin/requests', label: 'Requests',        permission: 'org:read' },
  { path: '/admin/settings', label: 'Org Settings',    permission: 'org:update' },
  { path: '/admin/security', label: 'Security Center', permission: 'security:read' },
  { path: '/admin/audit',    label: 'Audit Log',       permission: 'audit:read' },
  { path: '/admin/devices',  label: 'Devices',         permission: 'devices:read' },
  { path: '/admin/sso',      label: 'SSO',             permission: 'org:update' },
  { path: '/admin/alerts',   label: 'Alerts',          permission: 'security:read' },
];
