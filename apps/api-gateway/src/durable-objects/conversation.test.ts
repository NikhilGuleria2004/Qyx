import { describe, it, expect } from 'vitest';
import { ConversationDO } from './conversation';

describe('ConversationDO', () => {
  it('exports ConversationDO class', () => {
    expect(ConversationDO).toBeDefined();
    expect(typeof ConversationDO).toBe('function');
  });

  it('has expected methods', () => {
    const proto = ConversationDO.prototype;
    expect(typeof proto.fetch).toBe('function');
    expect(typeof proto.webSocketMessage).toBe('function');
    expect(typeof proto.webSocketClose).toBe('function');
    expect(typeof proto.webSocketError).toBe('function');
  });
});
