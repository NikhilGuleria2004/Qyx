import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes password', async () => {
    const hash = await hashPassword('testpass123');
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it('verifies correct password', async () => {
    const hash = await hashPassword('testpass123');
    const valid = await verifyPassword('testpass123', hash);
    expect(valid).toBe(true);
  });

  it('rejects incorrect password', async () => {
    const hash = await hashPassword('testpass123');
    const valid = await verifyPassword('wrongpass', hash);
    expect(valid).toBe(false);
  });
});
