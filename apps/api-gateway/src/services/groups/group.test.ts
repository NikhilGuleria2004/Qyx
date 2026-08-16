import { describe, it, expect } from 'vitest';
import { CreateGroupSchema } from './group.schema';

describe('group schemas', () => {
  it('validates create group', () => {
    const result = CreateGroupSchema.parse({
      name: 'Engineering Lead',
      description: 'Group for engineering leads',
    });
    expect(result.name).toBe('Engineering Lead');
    expect(result.description).toBe('Group for engineering leads');
  });

  it('rejects empty name', () => {
    expect(() => CreateGroupSchema.parse({
      name: '',
      description: 'desc',
    })).toThrow();
  });

  it('requires name', () => {
    expect(() => CreateGroupSchema.parse({
      description: 'desc',
    })).toThrow();
  });

  it('name max length 255', () => {
    const longName = 'a'.repeat(256);
    expect(() => CreateGroupSchema.parse({
      name: longName,
    })).toThrow();
  });
});
