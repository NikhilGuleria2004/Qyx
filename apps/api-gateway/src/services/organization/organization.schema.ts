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

export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;
export type AddDomain = z.infer<typeof AddDomainSchema>;
export type VerifyDomain = z.infer<typeof VerifyDomainSchema>;
