export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: Uint8Array;
  message_type: string;
  attachment_ref?: string;
  reply_to?: string;
  status: string;
  created_at: number;
}
