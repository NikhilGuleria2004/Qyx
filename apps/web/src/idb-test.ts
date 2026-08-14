import { describe, it, expect } from 'vitest';

describe('idb', () => {
  it('has indexedDB', () => {
    console.log('indexedDB:', typeof indexedDB);
    expect(typeof indexedDB).toBe('object');
  });
});
