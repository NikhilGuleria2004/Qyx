import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  let db: D1Database;
  let service: ConversationService;
  let conversations: Record<string, unknown>[];
  let conversationMembers: Record<string, unknown>[];
  let users: Record<string, unknown>[];

  beforeEach(() => {
    conversations = [];
    conversationMembers = [];
    users = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM users WHERE id = ?')) {
              return users.find((u) => u.id === args[0]) || null;
            }
            if (sql.includes('SELECT c.* FROM conversations c')) {
              const conv = conversations.find(
                (c) => c.organization_id === args[0] && c.type === 'direct'
              );
              if (conv) {
                const members = conversationMembers.filter(
                  (m) => m.conversation_id === conv.id && (m.user_id === args[1] || m.user_id === args[2]) && !m.removed_at
                );
                if (members.length >= 2) return conv;
              }
              return null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT c.* FROM conversations c')) {
              return {
                results: conversations.filter(
                  (c) => c.organization_id === args[1]
                ).filter((c) =>
                  conversationMembers.some(
                    (m) => m.conversation_id === c.id && m.user_id === args[0] && !m.removed_at
                  )
                ),
              };
            }
            if (sql.includes('SELECT * FROM conversation_members WHERE conversation_id = ?')) {
              return { results: conversationMembers.filter((m) => m.conversation_id === args[0] && !m.removed_at) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO conversations')) {
              conversations.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                type: args[2] as string,
                group_id: args[3] as string | null,
                created_at: args[4] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('INSERT INTO conversation_members')) {
              conversationMembers.push({
                conversation_id: args[0] as string,
                user_id: args[1] as string,
                role: args[2] as string,
                joined_at: args[3] as number,
                removed_at: args[4] as number | null,
              });
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new ConversationService(db);
  });

  it('creates a direct conversation between users in same org', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user1@example.com' },
      { id: 'usr_456', organization_id: 'org_123', email: 'user2@example.com' }
    );

    const conversation = await service.createDirectConversation('usr_123', 'org_123', 'usr_456');

    expect(conversation.id.startsWith('conv_')).toBe(true);
    expect(conversation.type).toBe('direct');
    expect(conversationMembers.length).toBe(2);
  });

  it('prevents creating conversation with self', async () => {
    await expect(
      service.createDirectConversation('usr_123', 'org_123', 'usr_123')
    ).rejects.toThrow('Cannot create conversation with yourself');
  });

  it('prevents creating conversation with user from different org', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user1@example.com' },
      { id: 'usr_456', organization_id: 'org_456', email: 'user2@example.com' }
    );

    await expect(
      service.createDirectConversation('usr_123', 'org_123', 'usr_456')
    ).rejects.toThrow('Cannot create conversation with user from another organization');
  });

  it('returns existing conversation if one already exists', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user1@example.com' },
      { id: 'usr_456', organization_id: 'org_123', email: 'user2@example.com' }
    );

    const conv1 = await service.createDirectConversation('usr_123', 'org_123', 'usr_456');
    const conv2 = await service.createDirectConversation('usr_123', 'org_123', 'usr_456');

    expect(conv1.id).toBe(conv2.id);
    expect(conversations.length).toBe(1);
  });

  it('lists user conversations scoped to org', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user1@example.com' },
      { id: 'usr_456', organization_id: 'org_123', email: 'user2@example.com' },
      { id: 'usr_789', organization_id: 'org_123', email: 'user3@example.com' }
    );

    await service.createDirectConversation('usr_123', 'org_123', 'usr_456');
    await service.createDirectConversation('usr_123', 'org_123', 'usr_789');

    const convs = await service.getUserConversations('usr_123', 'org_123');
    expect(convs.length).toBe(2);
  });

  it('lists conversation members', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user1@example.com' },
      { id: 'usr_456', organization_id: 'org_123', email: 'user2@example.com' }
    );

    const conv = await service.createDirectConversation('usr_123', 'org_123', 'usr_456');

    const members = await service.getConversationMembers(conv.id);
    expect(members.length).toBe(2);
  });
});
