import { describe, it, expect, beforeEach } from 'vitest';
import { FileService } from './file.service';
import { B2Storage } from '@qyx/storage';

function createMockStorage() {
  return {
    presignPutUrl: async (key: string) => `https://b2.example.com/${key}?token=put`,
    presignGetUrl: async (key: string) => `https://b2.example.com/${key}?token=get`,
  } as unknown as B2Storage;
}

describe('FileService security', () => {
  let db: D1Database;
  let service: FileService;
  let files: Record<string, unknown>[];

  beforeEach(() => {
    files = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM files WHERE id = ?')) {
              return files.find((f) => f.id === args[0]) || null;
            }
            if (sql.includes('SELECT allowed_file_types, max_file_size_mb FROM org_security_policy')) {
              return { allowed_file_types: 'pdf,docx,xlsx,png,jpg,mp4', max_file_size_mb: 500 };
            }
            if (sql.includes('SELECT external_sharing FROM org_security_policy')) {
              return { external_sharing: 0 };
            }
            if (sql.includes('SELECT 1 FROM conversation_members')) {
              return null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM files WHERE organization_id = ?')) {
              return { results: files.filter((f) => f.organization_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('UPDATE files SET status')) {
              const file = files.find((f) => f.id === args[1]);
              if (file) file.status = args[0];
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new FileService(db, createMockStorage());
  });

  it('rejects cross-org file access via getFile', async () => {
    files.push({
      id: 'file_1',
      organization_id: 'org_456',
      uploader_id: 'usr_2',
      encrypted_storage_reference: 'org_456/file_1',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      status: 'available',
      created_at: Date.now(),
    });

    const result = await service.getFile('file_1', 'usr_1');
    expect(result).toBeNull();
  });

  it('rejects cross-org download URL generation', async () => {
    files.push({
      id: 'file_1',
      organization_id: 'org_456',
      uploader_id: 'usr_2',
      encrypted_storage_reference: 'org_456/file_1',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      status: 'available',
      created_at: Date.now(),
    });

    const result = await service.getDownloadUrl('org_123', 'file_1', 'usr_999');
    expect(result).toBeNull();
  });

  it('rejects cross-org upload completion', async () => {
    files.push({
      id: 'file_1',
      organization_id: 'org_456',
      uploader_id: 'usr_2',
      encrypted_storage_reference: 'org_456/file_1',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      status: 'pending',
      created_at: Date.now(),
    });

    await expect(
      service.completeUpload('org_123', 'file_1')
    ).rejects.toThrow('Forbidden: file belongs to another organization');
  });

  it('lists files only for the requesting org', async () => {
    files.push(
      { id: 'file_1', organization_id: 'org_123', uploader_id: 'usr_1', encrypted_storage_reference: 'org_123/file_1', mime_type: 'application/pdf', size_bytes: 1000, status: 'available', created_at: Date.now() },
      { id: 'file_2', organization_id: 'org_123', uploader_id: 'usr_2', encrypted_storage_reference: 'org_123/file_2', mime_type: 'image/png', size_bytes: 500, status: 'available', created_at: Date.now() },
      { id: 'file_3', organization_id: 'org_456', uploader_id: 'usr_3', encrypted_storage_reference: 'org_456/file_3', mime_type: 'application/pdf', size_bytes: 2000, status: 'available', created_at: Date.now() }
    );

    const orgFiles = await service.listFiles('org_123');
    expect(orgFiles.length).toBe(2);
    orgFiles.forEach((f) => {
      expect(f.organization_id).toBe('org_123');
    });
  });

  it('allows uploader to access their own file', async () => {
    files.push({
      id: 'file_1',
      organization_id: 'org_123',
      uploader_id: 'usr_1',
      encrypted_storage_reference: 'org_123/file_1',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      status: 'available',
      created_at: Date.now(),
    });

    const result = await service.getFile('file_1', 'usr_1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('file_1');
  });

  it('blocks download URL for non-uploaders without access', async () => {
    files.push({
      id: 'file_1',
      organization_id: 'org_123',
      uploader_id: 'usr_2',
      encrypted_storage_reference: 'org_123/file_1',
      mime_type: 'application/pdf',
      size_bytes: 1000,
      status: 'available',
      created_at: Date.now(),
    });

    const downloadUrl = await service.getDownloadUrl('org_123', 'file_1', 'usr_999');
    expect(downloadUrl).toBeNull();
  });
});

describe('FileService policy enforcement', () => {
  let db: D1Database;
  let service: FileService;

  beforeEach(() => {
    db = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT allowed_file_types, max_file_size_mb FROM org_security_policy')) {
              return { allowed_file_types: 'pdf,docx,xlsx,png,jpg,mp4', max_file_size_mb: 500 };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    service = new FileService(db, createMockStorage());
  });

  it('enforces file type allow-list', async () => {
    await expect(
      service.requestUploadUrl('org_1', 'usr_1', { mime_type: 'application/x-python-code', size_bytes: 1024 })
    ).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('enforces file size limits', async () => {
    await expect(
      service.requestUploadUrl('org_1', 'usr_1', { mime_type: 'application/pdf', size_bytes: 600 * 1024 * 1024 })
    ).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('blocks dangerous file extensions even with wildcard policy', async () => {
    const dbWithWildcard = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT allowed_file_types')) {
              return { allowed_file_types: '*/*', max_file_size_mb: 500 };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const svc = new FileService(dbWithWildcard, createMockStorage());

    await expect(
      svc.requestUploadUrl('org_1', 'usr_1', { mime_type: 'application/x-msdownload', size_bytes: 1024 })
    ).rejects.toThrow('FILE_POLICY_VIOLATION');
  });

  it('allows permitted file types', async () => {
    const result = await service.requestUploadUrl('org_1', 'usr_1', {
      mime_type: 'application/pdf',
      size_bytes: 1024,
    });
    expect(result.fileId).toBeDefined();
    expect(result.uploadUrl).toBeDefined();
  });
});

describe('FileService storage scoping', () => {
  it('uses org-scoped object keys for uploads', async () => {
    let storedKey = '';
    const mockStorage = {
      presignPutUrl: async (key: string) => {
        storedKey = key;
        return `https://b2.example.com/${key}`;
      },
      presignGetUrl: async (key: string) => `https://b2.example.com/${key}`,
    } as unknown as B2Storage;

    const db = {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT allowed_file_types')) {
              return { allowed_file_types: 'pdf', max_file_size_mb: 500 };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new FileService(db, mockStorage);
    const result = await service.requestUploadUrl('org_123', 'usr_1', {
      mime_type: 'application/pdf',
      size_bytes: 1024,
    });

    expect(storedKey.startsWith('org_123/')).toBe(true);
    expect(storedKey.includes(result.fileId)).toBe(true);
  });
});
