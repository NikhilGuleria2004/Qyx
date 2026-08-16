import { z } from 'zod';

export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
});

export const GroupResponseSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  created_by: z.string().min(1),
  key_epoch: z.number().int().positive(),
  created_at: z.number().int().positive(),
});

export type CreateGroup = z.infer<typeof CreateGroupSchema>;
export type GroupResponse = z.infer<typeof GroupResponseSchema>;
