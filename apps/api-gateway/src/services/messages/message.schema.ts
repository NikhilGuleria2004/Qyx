import { z } from 'zod';

export const SendMessageSchema = z.object({
  ciphertext: z.instanceof(Uint8Array),
  message_type: z.enum(['text', 'image', 'audio', 'video', 'file', 'reaction']),
  attachment_ref: z.string().optional(),
  reply_to: z.string().optional(),
});

export const MessageResponseSchema = z.object({
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

export type SendMessage = z.infer<typeof SendMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
