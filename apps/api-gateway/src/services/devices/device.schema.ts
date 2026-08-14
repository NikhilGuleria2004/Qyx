import { z } from 'zod';

export const RegisterDeviceSchema = z.object({
  device_name: z.string().min(1).max(255),
  platform: z.enum(['web', 'ios', 'android', 'desktop']).optional(),
  public_key: z.string().base64(),
  signing_key: z.string().base64(),
});

export const AuthorizeDeviceSchema = z.object({
  payload: z.string().min(1),
});

export const ResolvePairingCodeSchema = z.object({
  pairing_code: z.string().min(1).max(8),
});

export const DeviceResponseSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  organization_id: z.string().min(1),
  device_name: z.string().min(1).max(255),
  platform: z.enum(['web', 'ios', 'android', 'desktop']).optional(),
  public_key: z.string().base64(),
  signing_key: z.string().base64(),
  status: z.enum(['pending', 'active', 'revoked']),
  created_at: z.number().int().positive(),
  last_seen_at: z.number().int().positive().optional(),
  pairing_code: z.string().optional(),
});

export type RegisterDevice = z.infer<typeof RegisterDeviceSchema>;
export type AuthorizeDevice = z.infer<typeof AuthorizeDeviceSchema>;
export type ResolvePairingCode = z.infer<typeof ResolvePairingCodeSchema>;
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;
