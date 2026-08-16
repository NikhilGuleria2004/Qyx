import { z } from 'zod';

export const GroupRequestSchema = z.object({});

export const ApproveRequestSchema = z.object({
  payload: z.string().min(1).optional(),
});

export const RejectRequestSchema = z.object({});

export type GroupRequest = z.infer<typeof GroupRequestSchema>;
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;
export type RejectRequest = z.infer<typeof RejectRequestSchema>;
