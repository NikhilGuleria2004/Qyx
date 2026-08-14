import { z } from 'zod';
import { Context } from 'hono';

const RoleSchema = z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']);

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  security_admin: 3,
  employee: 2,
};

const PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['org:read', 'org:update', 'members:read', 'members:write', 'groups:read', 'groups:write', 'channels:read', 'channels:write', 'audit:read', 'security:read'],
  manager: ['org:read', 'members:read', 'groups:read', 'groups:write', 'channels:read'],
  employee: ['org:read', 'conversations:read', 'conversations:write', 'files:read', 'files:write'],
  security_admin: ['org:read', 'members:read', 'devices:read', 'devices:write', 'audit:read', 'security:read'],
};

function hasPermission(role: string, requiredPermission: string): boolean {
  const perms = PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(requiredPermission);
}

function hasRoleLevel(role: string, minimumRole: string): boolean {
  return (ROLE_HIERARCHY[role] || 0) >= (ROLE_HIERARCHY[minimumRole] || 0);
}

export async function rbac(c: Context, next: () => Promise<void>) {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
      401
    );
  }

  const requiredPermission = c.get('permission');
  if (requiredPermission) {
    const role = RoleSchema.parse((user as { role: string }).role);
    if (!hasPermission(role, requiredPermission)) {
      return c.json(
        { error: { code: 'FORBIDDEN_ROLE', message: 'Insufficient permissions', request_id: crypto.randomUUID() } },
        403
      );
    }
  }

  const minimumRole = c.get('minimumRole');
  if (minimumRole) {
    const role = RoleSchema.parse((user as { role: string }).role);
    if (!hasRoleLevel(role, minimumRole)) {
      return c.json(
        { error: { code: 'FORBIDDEN_ROLE', message: 'Insufficient role', request_id: crypto.randomUUID() } },
        403
      );
    }
  }

  await next();
}
