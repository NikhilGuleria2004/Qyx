import { z } from 'zod';

export const CreateConversationSchema = z.object({
  user_id: z.string().min(1),
});

export const ConversationResponseSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  type: z.enum(['direct', 'group']),
  group_id: z.string().optional(),
  created_at: z.number().int().positive(),
});

export const ConversationMemberSchema = z.object({
  conversation_id: z.string().min(1),
  user_id: z.string().min(1),
  role: z.enum(['member', 'owner']),
  joined_at: z.number().int().positive(),
  removed_at: z.number().int().positive().optional(),
});

export type CreateConversation = z.infer<typeof CreateConversationSchema>;
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
export type ConversationMember = z.infer<typeof ConversationMemberSchema>;
