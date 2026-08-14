import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(255),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']).default('employee'),
  public_key: z.string().base64().optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']),
});

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'deactivated']),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUserRole = z.infer<typeof UpdateUserRoleSchema>;
export type UpdateUserStatus = z.infer<typeof UpdateUserStatusSchema>;
