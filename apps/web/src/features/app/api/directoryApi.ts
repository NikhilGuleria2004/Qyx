import { getAccessToken } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';

async function request<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Channel {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: string;
  created_at: number;
}

export interface Group {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: number;
}

export interface Conversation {
  id: string;
  organization_id: string;
  type: 'direct' | 'group' | 'channel';
  group_id: string | null;
  created_at: number;
}

export async function listChannels(): Promise<Channel[]> {
  const data = await request<{ channels: Channel[] }>('/v1/channels');
  return data.channels || [];
}

export async function listGroups(): Promise<Group[]> {
  const data = await request<{ groups: Group[] }>('/v1/groups');
  return data.groups || [];
}

export async function listConversations(): Promise<Conversation[]> {
  const data = await request<{ conversations: Conversation[] }>('/v1/conversations');
  return data.conversations || [];
}
