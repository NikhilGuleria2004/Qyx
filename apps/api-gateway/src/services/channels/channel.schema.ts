import { z } from 'zod';

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
});

export const ChannelRequestSchema = z.object({});

export const AckPostSchema = z.object({
  reaction: z.string().optional(),
});

export const ChannelResponseSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  created_by: z.string().min(1),
  created_at: z.number().int().positive(),
});

export type CreateChannel = z.infer<typeof CreateChannelSchema>;
export type ChannelRequest = z.infer<typeof ChannelRequestSchema>;
export type AckPost = z.infer<typeof AckPostSchema>;
export type ChannelResponse = z.infer<typeof ChannelResponseSchema>;
