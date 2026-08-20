import { getAccessToken } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';

export interface Conversation {
  id: string;
  organization_id: string;
  type: 'direct' | 'group' | 'channel';
  group_id: string | null;
  created_at: number;
}

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: number[];
  message_type: string;
  attachment_ref: string | null;
  reply_to: string | null;
  status: string;
  created_at: number;
}

export interface ConversationKey {
  user_id: string;
  public_key: string | null;
}

export interface ConversationKeys {
  conversation_id: string;
  members: ConversationKey[];
}

export async function listConversations(): Promise<Conversation[]> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/v1/conversations'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json() as { conversations: Conversation[] };
  return data.conversations || [];
}

export async function getMessages(conversationId: string, beforeCreatedAt?: number): Promise<Message[]> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const qs = beforeCreatedAt ? `?beforeCreatedAt=${beforeCreatedAt}` : '';
  const res = await fetch(apiUrl(`/v1/conversations/${conversationId}/messages${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json() as { messages: Message[] };
  return data.messages || [];
}

export async function sendMessage(conversationId: string, body: {
  ciphertext: number[];
  message_type?: string;
  attachment_ref?: string;
  reply_to?: string;
}): Promise<Message> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(`/v1/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<Message>;
}

export async function getConversationKeys(conversationId: string): Promise<ConversationKeys> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(`/v1/conversations/${conversationId}/keys`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<ConversationKeys>;
}

export async function createConversation(userId: string): Promise<Conversation> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl('/v1/conversations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<Conversation>;
}

export function toUint8Array(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

export function fromUint8Array(u8: Uint8Array): number[] {
  return Array.from(u8);
}
