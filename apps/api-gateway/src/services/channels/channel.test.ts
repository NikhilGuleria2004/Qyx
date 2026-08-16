import { describe, it, expect } from 'vitest';
import { CreateChannelSchema, AckPostSchema } from './channel.schema';

describe('channel schemas', () => {
  it('validates create channel', () => {
    const result = CreateChannelSchema.parse({
      name: 'general',
      description: 'Company-wide announcements',
    });
    expect(result.name).toBe('general');
    expect(result.description).toBe('Company-wide announcements');
  });

  it('rejects empty name', () => {
    expect(() => CreateChannelSchema.parse({
      name: '',
      description: 'desc',
    })).toThrow();
  });

  it('requires name', () => {
    expect(() => CreateChannelSchema.parse({
      description: 'desc',
    })).toThrow();
  });

  it('name max length 255', () => {
    const longName = 'a'.repeat(256);
    expect(() => CreateChannelSchema.parse({
      name: longName,
    })).toThrow();
  });

  it('validates ack post', () => {
    const result = AckPostSchema.parse({
      reaction: 'yes',
    });
    expect(result.reaction).toBe('yes');
  });

  it('allows empty ack body', () => {
    const result = AckPostSchema.parse({});
    expect(result.reaction).toBeUndefined();
  });
});
