import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
});

export const AddDomainSchema = z.object({
  domain: z.string().min(1).max(255),
});

export const VerifyDomainSchema = z.object({
  txt_record: z.string().min(1),
});

export const UpdateOrgSettingsSchema = z.object({
  recovery_policy: z.enum(['device_only', 'enterprise_key', 'user_backup']).optional(),
  mfa_required_roles: z.string().optional(),
  allowed_file_types: z.string().optional(),
  max_file_size_mb: z.number().int().positive().optional(),
  external_sharing: z.boolean().optional(),
  notification_preview: z.boolean().optional(),
});

export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;
export type AddDomain = z.infer<typeof AddDomainSchema>;
export type VerifyDomain = z.infer<typeof VerifyDomainSchema>;
export type UpdateOrgSettings = z.infer<typeof UpdateOrgSettingsSchema>;
