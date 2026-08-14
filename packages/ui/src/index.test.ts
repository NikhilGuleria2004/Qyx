import { describe, it, expect } from 'vitest';
import { cn } from './lib/utils.ts';

describe('ui', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', undefined, 'b')).toBe('a b');
  });
});
