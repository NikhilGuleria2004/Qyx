import { z } from 'zod';

export const CreateSsoProviderSchema = z.object({
  provider_name: z.string().min(1).max(255),
  provider_type: z.enum(['oidc', 'saml']).optional().default('oidc'),
  issuer_url: z.string().url().optional(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  authorization_url: z.string().url().optional(),
  token_url: z.string().url().optional(),
  userinfo_url: z.string().url().optional(),
  jwks_url: z.string().url().optional(),
  attribute_mapping: z.string().optional(),
});

export const UpdateSsoProviderSchema = z.object({
  provider_name: z.string().min(1).max(255).optional(),
  issuer_url: z.string().url().optional().nullable(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  authorization_url: z.string().url().optional().nullable(),
  token_url: z.string().url().optional().nullable(),
  userinfo_url: z.string().url().optional().nullable(),
  jwks_url: z.string().url().optional().nullable(),
  attribute_mapping: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type CreateSsoProvider = z.input<typeof CreateSsoProviderSchema>;
export type UpdateSsoProvider = z.input<typeof UpdateSsoProviderSchema>;
