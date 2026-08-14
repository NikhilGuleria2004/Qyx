import { describe, it, expect } from 'vitest';
import { CreateConversationSchema } from './conversation.schema';

describe('conversation schemas', () => {
  it('validates create conversation', () => {
    const result = CreateConversationSchema.parse({
      user_id: 'usr_123',
    });
    expect(result.user_id).toBe('usr_123');
  });

  it('requires user_id', () => {
    expect(() => CreateConversationSchema.parse({})).toThrow();
  });

  it('rejects empty user_id', () => {
    expect(() => CreateConversationSchema.parse({
      user_id: '',
    })).toThrow();
  });
});
