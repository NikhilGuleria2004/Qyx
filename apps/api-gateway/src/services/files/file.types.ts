export interface File {
  id: string;
  organization_id: string;
  uploader_id: string;
  encrypted_storage_reference: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: number;
  conversation_id?: string;
}
