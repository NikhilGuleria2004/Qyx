import { D1Database } from '@cloudflare/workers-types';
import { B2Storage } from '@qyx/storage';
import { getFileById, getFilesByOrg, createFile as dbCreateFile, updateFileStatus } from '../../db/queries/files';
import { UploadUrl } from './file.schema';
import { File } from './file.types';

const BLOCKED_EXTENSIONS = ['exe', 'dll', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'jar', 'app', 'deb', 'rpm', 'msi', 'com', 'scr'];
const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'video/mp4': 'mp4',
  'application/x-msdownload': 'exe',
};

function getExtensionFromMime(mimeType: string): string {
  const baseType = mimeType.split(';')[0].trim().toLowerCase();
  if (MIME_TYPE_MAP[baseType]) {
    return MIME_TYPE_MAP[baseType];
  }
  const parts = baseType.split('/');
  return parts[parts.length - 1].toLowerCase();
}

function isMimeTypeAllowed(mimeType: string, allowedTypes: string[]): boolean {
  const baseType = mimeType.split(';')[0].trim().toLowerCase();
  const extension = getExtensionFromMime(baseType);

  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return false;
  }

  const mimeCategory = baseType.split('/')[0];

  for (const allowed of allowedTypes) {
    const allowedClean = allowed.trim().toLowerCase();
    if (baseType === allowedClean || baseType.startsWith(allowedClean)) {
      return true;
    }
    if (extension === allowedClean) {
      return true;
    }
    if (allowedClean.includes('*')) {
      const prefix = allowedClean.replace('*', '');
      if (baseType.startsWith(prefix) || mimeCategory === prefix || extension === prefix) {
        return true;
      }
    }
  }

  return false;
}

export class FileService {
  constructor(
    private db: D1Database,
    private storage: B2Storage
  ) {}

  async validatePolicy(mimeType: string, sizeBytes: number, orgPolicy: { allowed_file_types: string; max_file_size_mb: number }): Promise<void> {
    const allowedTypes = orgPolicy.allowed_file_types.split(',').map(t => t.trim().toLowerCase());

    if (!isMimeTypeAllowed(mimeType, allowedTypes)) {
      throw new Error('FILE_POLICY_VIOLATION: File type not permitted by organization policy.');
    }

    const maxSizeBytes = orgPolicy.max_file_size_mb * 1024 * 1024;
    if (sizeBytes > maxSizeBytes) {
      throw new Error(`FILE_POLICY_VIOLATION: File size exceeds maximum allowed size of ${orgPolicy.max_file_size_mb}MB.`);
    }
  }

  async requestUploadUrl(organizationId: string, uploaderId: string, data: UploadUrl): Promise<{ fileId: string; uploadUrl: string; expiresIn: number }> {
    const policyResult = await this.db.prepare('SELECT allowed_file_types, max_file_size_mb FROM org_security_policy WHERE organization_id = ?').bind(organizationId).first();
    const policy = policyResult as unknown as { allowed_file_types: string; max_file_size_mb: number } | undefined;

    if (!policy) {
      throw new Error('Organization policy not found');
    }

    await this.validatePolicy(data.mime_type, data.size_bytes, policy);

    const fileId = `file_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const objectKey = `${organizationId}/${fileId}`;

    await dbCreateFile(this.db, fileId, organizationId, uploaderId, objectKey, data.mime_type, data.size_bytes, data.conversation_id);

    const uploadUrl = await this.storage.presignPutUrl(objectKey, 300, data.mime_type);

    return {
      fileId,
      uploadUrl,
      expiresIn: 300,
    };
  }

  async completeUpload(organizationId: string, fileId: string): Promise<File> {
    const file = await getFileById(this.db, fileId);
    const fileData = file as unknown as File | undefined;

    if (!fileData) {
      throw new Error('File not found');
    }

    if (fileData.organization_id !== organizationId) {
      throw new Error('Forbidden: file belongs to another organization');
    }

    await updateFileStatus(this.db, organizationId, fileId, 'available');

    const updated = await getFileById(this.db, fileId);
    return updated as unknown as File;
  }

  async getDownloadUrl(organizationId: string, fileId: string): Promise<string | null> {
    const file = await getFileById(this.db, fileId);
    const fileData = file as unknown as File | undefined;

    if (!fileData) {
      return null;
    }

    if (fileData.organization_id !== organizationId) {
      return null;
    }

    return this.storage.presignGetUrl(fileData.encrypted_storage_reference, 300);
  }

  async getFile(fileId: string, userId: string): Promise<File | null> {
    const file = await getFileById(this.db, fileId);
    const fileData = file as unknown as File | undefined;

    if (!fileData) {
      return null;
    }

    if (fileData.uploader_id === userId) {
      return fileData;
    }

    const orgPolicy = await this.db.prepare('SELECT external_sharing FROM org_security_policy WHERE organization_id = ?').bind(fileData.organization_id).first();
    const policy = orgPolicy as unknown as { external_sharing: number } | undefined;
    if (policy?.external_sharing) {
      return fileData;
    }

    if (fileData.conversation_id) {
      const member = await this.db.prepare(
        'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND removed_at IS NULL'
      ).bind(fileData.conversation_id, userId).first();

      if (member) {
        return fileData;
      }
    }

    return null;
  }

  async listFiles(organizationId: string): Promise<File[]> {
    const files = await getFilesByOrg(this.db, organizationId);
    return files as unknown as File[];
  }
}
