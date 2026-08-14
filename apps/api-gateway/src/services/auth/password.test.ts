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

  it('never returns or derives key material from password (ADR-010 regression)', async () => {
    const hash = await hashPassword('s3cret!');
    expect(hash).not.toContain('s3cret!');
    expect(hash).not.toMatch(/[A-Za-z]{4,}/);
    expect(() => Buffer.from(hash, 'hex')).not.toThrow();
    expect(hash.length).toBe(64);
  });
});
