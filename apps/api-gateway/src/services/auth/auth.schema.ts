import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(1).max(255),
  organization_name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
  invite_code: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device_name: z.string().min(1).max(255),
  platform: z.enum(['web', 'ios', 'android', 'desktop']).optional(),
});

export const MfaVerifySchema = z.object({
  mfa_code: z.string().length(6),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export type Register = z.infer<typeof RegisterSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type MfaVerify = z.infer<typeof MfaVerifySchema>;
export type Refresh = z.infer<typeof RefreshSchema>;
