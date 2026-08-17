import { describe, it, expect } from 'vitest';
import { getOrphanedFiles } from '../../db/queries/files';
import { FileService } from './file.service';

describe('file service', () => {
  it('validates policy and requests upload URL', async () => {
    const policy = { allowed_file_types: 'pdf,docx,xlsx,pptx,png,jpg,mp4', max_file_size_mb: 500 };
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT allowed_file_types')) {
              return { ...policy };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/pdf',
      size_bytes: 2048310,
    });

    expect(result.fileId).toBeDefined();
    expect(result.uploadUrl).toContain('org_1/');
    expect(result.uploadUrl).toContain(result.fileId);
    expect(result.expiresIn).toBe(300);
  });

  it('stores conversation_id when provided', async () => {
    let insertedConversationId: string | null = null;
    const policy = { allowed_file_types: 'pdf,docx,xlsx,pptx,png,jpg,mp4', max_file_size_mb: 500 };
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT allowed_file_types')) {
              return { ...policy };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.startsWith('INSERT INTO files')) {
              insertedConversationId = _args[8] as string | null;
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    await service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/pdf',
      size_bytes: 1024,
      conversation_id: 'conv_1',
    });

    expect(insertedConversationId).toBe('conv_1');
  });

  it('rejects disallowed mime type with FILE_POLICY_VIOLATION', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({
            allowed_file_types: 'pdf,docx,xlsx,pptx,png,jpg,mp4',
            max_file_size_mb: 500,
          }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    await expect(service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/x-msdownload',
      size_bytes: 1024,
    })).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('rejects oversized files with FILE_POLICY_VIOLATION', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({
            allowed_file_types: 'pdf,docx,xlsx,pptx,png,jpg,mp4',
            max_file_size_mb: 10,
          }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    await expect(service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/pdf',
      size_bytes: 20 * 1024 * 1024,
    })).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('rejects executable file types', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({
            allowed_file_types: '*/*',
            max_file_size_mb: 500,
          }),
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    await expect(service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/x-msdownload',
      size_bytes: 1024,
    })).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('allows uploader to download their file', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT * FROM files WHERE id')) {
              return {
                id: 'file_1',
                organization_id: 'org_1',
                uploader_id: 'usr_1',
                encrypted_storage_reference: 'org_1/file_1',
                mime_type: 'application/pdf',
                size_bytes: 1000,
                status: 'available',
                created_at: Date.now(),
                conversation_id: 'conv_1',
              };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.getFile('file_1', 'usr_1');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('file_1');
  });

  it('allows conversation member to download file', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT * FROM files WHERE id')) {
              return {
                id: 'file_1',
                organization_id: 'org_1',
                uploader_id: 'usr_2',
                encrypted_storage_reference: 'org_1/file_1',
                mime_type: 'application/pdf',
                size_bytes: 1000,
                status: 'available',
                created_at: Date.now(),
                conversation_id: 'conv_1',
              };
            }
            if (_sql.includes('SELECT external_sharing')) {
              return { external_sharing: 0 };
            }
            if (_sql.includes('SELECT 1 FROM conversation_members')) {
              return { '1': 1 };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.getFile('file_1', 'usr_3');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('file_1');
  });

  it('denies non-member download when external sharing is off', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT * FROM files WHERE id')) {
              return {
                id: 'file_1',
                organization_id: 'org_1',
                uploader_id: 'usr_2',
                encrypted_storage_reference: 'org_1/file_1',
                mime_type: 'application/pdf',
                size_bytes: 1000,
                status: 'available',
                created_at: Date.now(),
                conversation_id: 'conv_1',
              };
            }
            if (_sql.includes('SELECT external_sharing')) {
              return { external_sharing: 0 };
            }
            if (_sql.includes('SELECT 1 FROM conversation_members')) {
              return null;
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.getFile('file_1', 'usr_3');
    expect(result).toBeNull();
  });

  it('allows non-member download when external sharing is on', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT * FROM files WHERE id')) {
              return {
                id: 'file_1',
                organization_id: 'org_1',
                uploader_id: 'usr_2',
                encrypted_storage_reference: 'org_1/file_1',
                mime_type: 'application/pdf',
                size_bytes: 1000,
                status: 'available',
                created_at: Date.now(),
                conversation_id: 'conv_1',
              };
            }
            if (_sql.includes('SELECT external_sharing')) {
              return { external_sharing: 1 };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.getFile('file_1', 'usr_3');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('file_1');
  });

  it('completes upload and marks file as available', async () => {
    let status = 'pending';
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (_sql.includes('SELECT * FROM files WHERE id')) {
              return {
                id: 'file_1',
                organization_id: 'org_1',
                uploader_id: 'usr_1',
                encrypted_storage_reference: 'org_1/file_1',
                mime_type: 'application/pdf',
                size_bytes: 1000,
                status,
                created_at: Date.now(),
              };
            }
            if (_sql.includes('SELECT allowed_file_types')) {
              return { allowed_file_types: 'pdf', max_file_size_mb: 500 };
            }
            return undefined;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (_sql.startsWith('UPDATE files SET status')) {
              status = 'available';
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db);
    const result = await service.completeUpload('file_1');
    expect(result.status).toBe('available');
  });

  it('getOrphanedFiles returns pending files older than cutoff', async () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          all: async () => ({
            results: [
              { id: 'file_1', created_at: cutoff - 1000 },
              { id: 'file_2', created_at: cutoff + 1000 },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;

    const results = await getOrphanedFiles(db, cutoff);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('file_1');
  });
});
