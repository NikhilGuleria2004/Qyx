import { z } from 'zod';

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  status: z.enum(['active', 'suspended']),
  security_tier: z.enum(['standard', 'high', 'maximum']),
  created_at: z.number().int().positive(),
});

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  email: z.string().email(),
  display_name: z.string().min(1).max(255),
  role: z.enum(['super_admin', 'admin', 'manager', 'employee', 'security_admin']),
  status: z.enum(['active', 'suspended', 'deactivated']),
  public_key: z.string().base64().optional(),
  created_at: z.number().int().positive(),
  last_active_at: z.number().int().positive().optional(),
});

export const DeviceSchema = z.object({
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
});

export const ConversationSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  type: z.enum(['direct', 'group']),
  group_id: z.string().optional(),
  created_at: z.number().int().positive(),
});

export const MessageSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  conversation_id: z.string().min(1),
  sender_id: z.string().min(1),
  ciphertext: z.instanceof(Uint8Array),
  message_type: z.enum(['text', 'image', 'audio', 'video', 'file', 'reaction']),
  attachment_ref: z.string().optional(),
  reply_to: z.string().optional(),
  status: z.enum(['sent', 'delivered', 'read']),
  created_at: z.number().int().positive(),
});

export const GroupSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  created_by: z.string().min(1),
  key_epoch: z.number().int().positive(),
  created_at: z.number().int().positive(),
});

export const ChannelSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  created_by: z.string().min(1),
  created_at: z.number().int().positive(),
});

export const FileSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  uploader_id: z.string().min(1),
  encrypted_storage_reference: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
  status: z.enum(['pending', 'available', 'deleted']),
  created_at: z.number().int().positive(),
});

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  actor_id: z.string().optional(),
  event_type: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.number().int().positive(),
});

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    request_id: z.string().min(1),
  }),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;
export type User = z.infer<typeof UserSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type File = z.infer<typeof FileSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
