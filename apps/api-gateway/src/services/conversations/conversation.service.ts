import { D1Database } from '@cloudflare/workers-types';
import { getUserById } from '../../db/queries/users';
import { getDirectConversation, createConversation, addConversationMember, getConversationsByUser, getConversationMembers as dbGetConversationMembers } from '../../db/queries/conversations';
import { Conversation, ConversationMember } from './conversation.types';

export class ConversationService {
  constructor(private db: D1Database) {}

  async createDirectConversation(currentUserId: string, currentUserOrgId: string, targetUserId: string): Promise<Conversation> {
    if (currentUserId === targetUserId) {
      throw new Error('Cannot create conversation with yourself');
    }

    const targetUser = await getUserById(this.db, targetUserId);
    const target = targetUser as { id: string; organization_id: string; email: string } | null;

    if (!target) {
      throw new Error('User not found');
    }

    if (target.organization_id !== currentUserOrgId) {
      throw new Error('Cannot create conversation with user from another organization');
    }

    const existing = await getDirectConversation(this.db, currentUserOrgId, currentUserId, targetUserId);
    if (existing) {
      return existing as unknown as Conversation;
    }

    const conversationId = `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await createConversation(this.db, conversationId, currentUserOrgId, 'direct');

    await addConversationMember(this.db, conversationId, currentUserId, 'member');
    await addConversationMember(this.db, conversationId, targetUserId, 'member');

    const created = await getConversationsByUser(this.db, currentUserId, currentUserOrgId);
    const conversations = created as unknown as Conversation[];
    const newConversation = conversations.find(c => c.id === conversationId);

    if (!newConversation) {
      throw new Error('Failed to create conversation');
    }

    return newConversation;
  }

  async getUserConversations(userId: string, organizationId: string): Promise<Conversation[]> {
    const conversations = await getConversationsByUser(this.db, userId, organizationId);
    return conversations as unknown as Conversation[];
  }

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const members = await dbGetConversationMembers(this.db, conversationId);
    return members as unknown as ConversationMember[];
  }
}
