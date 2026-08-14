import { D1Database } from '@cloudflare/workers-types';
import { createMessage, getMessagesByConversation, getMessageById } from '../../db/queries/messages';
import { getConversationMembers } from '../../db/queries/conversations';
import { Message } from './message.types';
import { SendMessage } from './message.schema';

export interface SendMessageResult extends Message {
  recipient_ids: string[];
}

export class MessageService {
  constructor(private db: D1Database) {}

  async sendMessage(conversationId: string, senderId: string, organizationId: string, data: SendMessage): Promise<SendMessageResult> {
    const members = await getConversationMembers(this.db, conversationId);
    const memberList = members as { user_id: string }[];
    const isMember = memberList.some(m => m.user_id === senderId);

    if (!isMember) {
      throw new Error('Sender is not a member of this conversation');
    }

    const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await createMessage(
      this.db,
      messageId,
      organizationId,
      conversationId,
      senderId,
      data.ciphertext,
      data.message_type,
      data.attachment_ref,
      data.reply_to
    );

    const created = await getMessageById(this.db, messageId);
    const message = created as unknown as Message;
    const recipientIds = memberList
      .map(m => m.user_id)
      .filter(id => id !== senderId);

    return {
      ...message,
      recipient_ids: recipientIds,
    };
  }

  async listMessages(conversationId: string, organizationId: string, limit = 50, beforeCreatedAt?: number): Promise<Message[]> {
    const messages = await getMessagesByConversation(this.db, conversationId, organizationId, limit, beforeCreatedAt);
    return messages as unknown as Message[];
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const message = await getMessageById(this.db, messageId);
    return message as unknown as Message | null;
  }
}
