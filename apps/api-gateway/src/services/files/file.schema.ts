import { z } from 'zod';

export const UploadUrlSchema = z.object({
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
  conversation_id: z.string().optional(),
});

export const CompleteUploadSchema = z.object({
  file_id: z.string().min(1),
});

export const FileResponseSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  uploader_id: z.string().min(1),
  encrypted_storage_reference: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
  status: z.enum(['pending', 'available', 'deleted']),
  created_at: z.number().int().positive(),
  conversation_id: z.string().optional(),
});

export type UploadUrl = z.infer<typeof UploadUrlSchema>;
export type CompleteUpload = z.infer<typeof CompleteUploadSchema>;
export type FileResponse = z.infer<typeof FileResponseSchema>;
