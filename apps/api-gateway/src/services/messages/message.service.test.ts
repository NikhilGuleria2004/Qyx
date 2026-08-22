import { describe, it, expect, beforeEach } from 'vitest';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let db: D1Database;
  let service: MessageService;
  let messages: Record<string, unknown>[];
  let conversationMembers: Record<string, unknown>[];

  beforeEach(() => {
    messages = [];
    conversationMembers = [];

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM messages WHERE id = ?')) {
              return messages.find((m) => m.id === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM messages WHERE conversation_id = ?')) {
              return {
                results: messages
                  .filter((m) => m.conversation_id === args[0] && m.organization_id === args[1])
                  .sort((a, b) => (b.created_at as number) - (a.created_at as number))
                  .slice(0, args[args.length - 1] as number),
              };
            }
            if (sql.includes('SELECT * FROM conversation_members WHERE conversation_id = ?')) {
              return { results: conversationMembers.filter((m) => m.conversation_id === args[0] && !m.removed_at) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO messages')) {
              messages.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                conversation_id: args[2] as string,
                sender_id: args[3] as string,
                ciphertext: args[4] as Uint8Array,
                message_type: args[5] as string,
                attachment_ref: args[6] as string | null,
                reply_to: args[7] as string | null,
                status: args[8] as string,
                created_at: args[9] as number,
              });
              return { changes: 1 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new MessageService(db);
  });

  it('sends a message to a conversation', async () => {
    conversationMembers.push(
      { conversation_id: 'conv_123', user_id: 'usr_123', role: 'member' },
      { conversation_id: 'conv_123', user_id: 'usr_456', role: 'member' }
    );

    const result = await service.sendMessage('conv_123', 'usr_123', 'org_123', {
      ciphertext: new Uint8Array([1, 2, 3]),
      message_type: 'text',
    });

    expect(result.id.startsWith('msg_')).toBe(true);
    expect(result.sender_id).toBe('usr_123');
    expect(result.conversation_id).toBe('conv_123');
    expect(result.recipient_ids).toEqual(['usr_456']);
    expect(messages.length).toBe(1);
  });

  it('prevents sending message to conversation user is not member of', async () => {
    conversationMembers.push(
      { conversation_id: 'conv_123', user_id: 'usr_456', role: 'member' }
    );

    await expect(
      service.sendMessage('conv_123', 'usr_123', 'org_123', {
        ciphertext: new Uint8Array([1, 2, 3]),
        message_type: 'text',
      })
    ).rejects.toThrow('Sender is not a member of this conversation');
  });

  it('lists messages for conversation members only', async () => {
    conversationMembers.push(
      { conversation_id: 'conv_123', user_id: 'usr_123', role: 'member' },
      { conversation_id: 'conv_123', user_id: 'usr_456', role: 'member' }
    );

    messages.push(
      { id: 'msg_1', conversation_id: 'conv_123', organization_id: 'org_123', sender_id: 'usr_123', created_at: 100 },
      { id: 'msg_2', conversation_id: 'conv_123', organization_id: 'org_123', sender_id: 'usr_456', created_at: 200 }
    );

    const listed = await service.listMessages('conv_123', 'usr_123', 'org_123');
    expect(listed.length).toBe(2);
  });

  it('prevents listing messages for non-members', async () => {
    conversationMembers.push(
      { conversation_id: 'conv_123', user_id: 'usr_456', role: 'member' }
    );

    messages.push(
      { id: 'msg_1', conversation_id: 'conv_123', organization_id: 'org_123', sender_id: 'usr_456', created_at: 100 }
    );

    await expect(
      service.listMessages('conv_123', 'usr_123', 'org_123')
    ).rejects.toThrow('Not a member of this conversation');
  });

  it('returns null for non-existent message', async () => {
    const result = await service.getMessage('msg_nonexistent');
    expect(result).toBeNull();
  });

  it('gets a message by id', async () => {
    messages.push({
      id: 'msg_123',
      conversation_id: 'conv_123',
      organization_id: 'org_123',
      sender_id: 'usr_123',
      ciphertext: new Uint8Array([1, 2, 3]),
      message_type: 'text',
      status: 'sent',
      created_at: Date.now(),
    });

    const result = await service.getMessage('msg_123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('msg_123');
  });
});
