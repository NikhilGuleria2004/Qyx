export interface Conversation {
  id: string;
  organization_id: string;
  type: 'direct' | 'group';
  group_id?: string;
  created_at: number;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role: 'member' | 'owner';
  joined_at: number;
  removed_at?: number;
}
