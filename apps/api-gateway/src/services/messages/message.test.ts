import { describe, it, expect } from 'vitest';
import { SendMessageSchema } from './message.schema';

describe('message schemas', () => {
  it('validates send message', () => {
    const result = SendMessageSchema.parse({
      ciphertext: new Uint8Array([0x01, 0x02, 0x03]),
      message_type: 'text',
    });
    expect(result.message_type).toBe('text');
  });

  it('requires ciphertext', () => {
    expect(() => SendMessageSchema.parse({
      message_type: 'text',
    })).toThrow();
  });

  it('requires message_type', () => {
    expect(() => SendMessageSchema.parse({
      ciphertext: new Uint8Array([0x01]),
    })).toThrow();
  });

  it('rejects invalid message_type', () => {
    expect(() => SendMessageSchema.parse({
      ciphertext: new Uint8Array([0x01]),
      message_type: 'invalid',
    })).toThrow();
  });
});
