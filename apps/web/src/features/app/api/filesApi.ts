import { getAccessToken } from '../../../lib/auth';

export interface UploadUrlRequest {
  mime_type: string;
  size_bytes: number;
  conversation_id?: string;
}

export interface UploadUrlResponse {
  file_id: string;
  upload_url: string;
  expires_in: number;
}

export interface CompleteUploadRequest {
  file_id: string;
}

export interface CompleteUploadResponse {
  file_id: string;
  status: string;
}

export interface DownloadUrlResponse {
  file_id: string;
  download_url: string;
  expires_in: number;
  mime_type: string;
  size_bytes: number;
}

export async function requestUploadUrl(data: UploadUrlRequest): Promise<UploadUrlResponse> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/v1/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<UploadUrlResponse>;
}

export async function completeUpload(data: CompleteUploadRequest): Promise<CompleteUploadResponse> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/v1/files/' + data.file_id + '/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<CompleteUploadResponse>;
}

export async function getDownloadUrl(fileId: string): Promise<DownloadUrlResponse> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/v1/files/' + fileId + '/download-url', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<DownloadUrlResponse>;
}

export async function uploadToR2(url: string, data: ArrayBuffer): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: data,
  });
  if (!res.ok) {
    throw new Error('Failed to upload to R2: HTTP ' + res.status);
  }
}

export async function downloadFromR2(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to download from R2: HTTP ' + res.status);
  }
  return res.arrayBuffer();
}
