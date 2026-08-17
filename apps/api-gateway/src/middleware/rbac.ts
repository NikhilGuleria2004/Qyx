import { z } from 'zod';
import { Context } from 'hono';
import { createLogger } from '../utils/logger';

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
  const requestId = c.get('requestId') as string;
  const logger = createLogger(requestId);
  const user = c.get('user');
  if (!user) {
    logger.warn('Unauthenticated access attempt', { path: c.req.path, method: c.req.method });
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: requestId } },
      401
    );
  }

  const requiredPermission = c.get('permission');
  if (requiredPermission) {
    const role = RoleSchema.parse((user as { role: string }).role);
    if (!hasPermission(role, requiredPermission)) {
      logger.warn('Insufficient permissions', { role, required_permission: requiredPermission, path: c.req.path, method: c.req.method });
      return c.json(
        { error: { code: 'FORBIDDEN_ROLE', message: 'Insufficient permissions', request_id: requestId } },
        403
      );
    }
  }

  const minimumRole = c.get('minimumRole');
  if (minimumRole) {
    const role = RoleSchema.parse((user as { role: string }).role);
    if (!hasRoleLevel(role, minimumRole)) {
      logger.warn('Insufficient role', { role, minimum_role: minimumRole, path: c.req.path, method: c.req.method });
      return c.json(
        { error: { code: 'FORBIDDEN_ROLE', message: 'Insufficient role', request_id: requestId } },
        403
      );
    }
  }

  await next();
}
