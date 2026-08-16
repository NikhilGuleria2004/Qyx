import { Hono } from 'hono';
import { auth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac } from '../../middleware/rbac';
import { AuditService } from '../audit/audit.service';
import { FileService } from './file.service';
import { UploadUrlSchema, CompleteUploadSchema } from './file.schema';

type FileBindings = {
  PRIMARY_DB: D1Database;
  ATTACHMENTS_BUCKET: R2Bucket;
};

type FileVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
};

const app = new Hono<{ Bindings: FileBindings; Variables: FileVariables }>();

app.post('/upload-url', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'files:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = UploadUrlSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new FileService(c.env.PRIMARY_DB);
  
  try {
    const result = await service.requestUploadUrl(user.organization_id, user.user_id, parsed.data);

    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: user.organization_id,
      actor_id: user.user_id,
      event_type: 'file_upload_requested',
      metadata: { file_id: result.fileId, mime_type: parsed.data.mime_type, size_bytes: parsed.data.size_bytes },
    });

    return c.json({
      file_id: result.fileId,
      upload_url: result.uploadUrl,
      expires_in: result.expiresIn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to request upload URL';
    if (message.includes('FILE_POLICY_VIOLATION')) {
      return c.json(
        { error: { code: 'FILE_POLICY_VIOLATION', message: message.replace('FILE_POLICY_VIOLATION: ', ''), request_id: crypto.randomUUID() } },
        422
      );
    }
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message, request_id: crypto.randomUUID() } },
      500
    );
  }
});

app.post('/:fileId/complete', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'files:write');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const body = await c.req.json();
  const parsed = CompleteUploadSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new FileService(c.env.PRIMARY_DB);
  
  try {
    const file = await service.completeUpload(parsed.data.file_id);

    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: user.organization_id,
      actor_id: user.user_id,
      event_type: 'file_upload_completed',
      metadata: { file_id: file.id, status: file.status },
    });

    return c.json({ file_id: file.id, status: file.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete upload';
    return c.json(
      { error: { code: 'NOT_FOUND', message, request_id: crypto.randomUUID() } },
      404
    );
  }
});

app.get('/:fileId/download-url', auth, orgScope, rbac, async (c) => {
  (c as unknown as { set: (key: string, value: unknown) => void }).set('permission', 'files:read');
  const user = c.get('user') as { user_id: string; organization_id: string };
  const fileId = c.req.param('fileId')!;

  const service = new FileService(c.env.PRIMARY_DB);
  const file = await service.getFile(fileId, user.user_id);

  if (!file) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'File not found or access denied', request_id: crypto.randomUUID() } },
      404
    );
  }

  const downloadUrl = `https://r2.example.com/${file.encrypted_storage_reference}?sig=${crypto.randomUUID().replace(/-/g, '')}`;

  return c.json({
    file_id: file.id,
    download_url: downloadUrl,
    expires_in: 300,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
  });
});

export default app;
