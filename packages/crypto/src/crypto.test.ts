import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  sharedSecret,
  encrypt,
  decrypt,
  sign,
  verify,
  hkdf,
  randomBytes,
  fingerprint,
  securityNumber,
} from './index.ts';

describe('generateKeyPair', () => {
  it('generates X25519 key pair', async () => {
    const { publicKey, privateKey } = await generateKeyPair('x25519');
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(32);
    expect(privateKey).toBeInstanceOf(CryptoKey);
  });

  it('generates Ed25519 key pair', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ed25519');
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(32);
    expect(privateKey).toBeInstanceOf(CryptoKey);
  });

  it('generates different key pairs on each call', async () => {
    const a = await generateKeyPair('x25519');
    const b = await generateKeyPair('x25519');
    expect(a.publicKey).not.toEqual(b.publicKey);
  });
});

describe('sharedSecret', () => {
  it('produces matching shared secret for X25519 key pairs', async () => {
    const alice = await generateKeyPair('x25519');
    const bob = await generateKeyPair('x25519');

    const secretA = await sharedSecret(alice.privateKey, bob.publicKey);
    const secretB = await sharedSecret(bob.privateKey, alice.publicKey);

    expect(secretA).toEqual(secretB);
    expect(secretA.length).toBe(32);
  });
});

describe('sign and verify', () => {
  it('signs and verifies with Ed25519', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ed25519');
    const message = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const signature = await sign(privateKey, message);
    const valid = await verify(publicKey, signature, message);

    expect(signature.length).toBe(64);
    expect(valid).toBe(true);
  });

  it('rejects tampered message', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ed25519');
    const message = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const signature = await sign(privateKey, message);
    const tampered = new Uint8Array([0x01, 0x02, 0x03, 0x05]);
    const valid = await verify(publicKey, signature, tampered);

    expect(valid).toBe(false);
  });

  it('verifies with raw public key bytes', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ed25519');
    const message = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

    const signature = await sign(privateKey, message);
    const valid = await verify(publicKey, signature, message);

    expect(valid).toBe(true);
  });
});

describe('encrypt and decrypt', () => {
  it('round-trips plaintext through AES-256-GCM', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const plaintext = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, nonce);

    expect(ciphertext.length).toBe(plaintext.length + 16);
    expect(decrypted).toEqual(plaintext);
  });

  it('passes known-answer test vector', async () => {
    const keyBytes = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
      0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
      0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    ]);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const nonce = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    const plaintext = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
      0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
      0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
      0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27,
      0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
    ]);
    const expectedCiphertext = new Uint8Array([
      0x47, 0x03, 0xd4, 0x18, 0xc1, 0xe0, 0xc4, 0x1c,
      0x85, 0x48, 0x9d, 0x80, 0xbd, 0xe4, 0x76, 0x62,
      0x93, 0xc7, 0x95, 0x27, 0xe4, 0x6e, 0x49, 0x6b,
      0x20, 0x7e, 0xff, 0x9e, 0x01, 0x74, 0x1e, 0xad,
      0x21, 0x31, 0x8c, 0xdf, 0x8b, 0xe4, 0x34, 0xbf,
      0x5c, 0x8d, 0x55, 0xc6, 0xa4, 0xaa, 0x06, 0x17,
      0x7a, 0xed, 0x1e, 0x90, 0x28, 0x11, 0xaa, 0x78,
      0xde, 0xae, 0xe4, 0x1e, 0xcc, 0x79, 0x7d, 0x58,
    ]);

    const { ciphertext } = await encrypt(key, plaintext, nonce);

    expect(ciphertext).toEqual(expectedCiphertext);
  });

  it('rejects tampered ciphertext', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const plaintext = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0x01;

    await expect(decrypt(key, tampered, nonce)).rejects.toThrow();
  });

  it('rejects tampered nonce', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const plaintext = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const tamperedNonce = new Uint8Array(nonce);
    tamperedNonce[0] ^= 0x01;

    await expect(decrypt(key, ciphertext, tamperedNonce)).rejects.toThrow();
  });

  it('handles empty plaintext', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const plaintext = new Uint8Array([]);

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, nonce);

    expect(ciphertext.length).toBe(16);
    expect(decrypted).toEqual(plaintext);
  });
});

describe('hkdf', () => {
  it('derives correct output for RFC 5869 Test Case 1', async () => {
    const salt = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);
    const ikm = new Uint8Array([
      0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
      0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
      0x0b, 0x0b, 0x0b, 0x0b, 0x0b, 0x0b,
    ]);
    const info = new Uint8Array([0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9]);

    const okm = await hkdf(salt, ikm, info, 42);

    expect(okm).toEqual(
      new Uint8Array([
        0x3c, 0xb2, 0x5f, 0x25, 0xfa, 0xac, 0xd5, 0x7a,
        0x90, 0x43, 0x4f, 0x64, 0xd0, 0x36, 0x2f, 0x2a,
        0x2d, 0x2d, 0x0a, 0x90, 0xcf, 0x1a, 0x5a, 0x4c,
        0x5d, 0xb0, 0x2d, 0x56, 0xec, 0xc4, 0xc5, 0xbf,
        0x34, 0x00, 0x72, 0x08, 0xd5, 0xb8, 0x87, 0x18,
        0x58, 0x65,
      ])
    );
  });
});

describe('randomBytes', () => {
  it('returns requested length', () => {
    const bytes = randomBytes(16);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(16);
  });

  it('returns different values on each call', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(a).not.toEqual(b);
  });

  it('returns zeros for zero length', () => {
    const bytes = randomBytes(0);
    expect(bytes.length).toBe(0);
  });
});

describe('fingerprint', () => {
  it('produces a deterministic SHA-256 hex string', async () => {
    const key = new Uint8Array([0x01, 0x02, 0x03]);
    const fp = await fingerprint(key);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different fingerprints for different keys', async () => {
    const fp1 = await fingerprint(new Uint8Array([0x01]));
    const fp2 = await fingerprint(new Uint8Array([0x02]));
    expect(fp1).not.toBe(fp2);
  });

  it('produces same fingerprint for same key', async () => {
    const key = new Uint8Array([0x01, 0x02, 0x03]);
    const fp1 = await fingerprint(key);
    const fp2 = await fingerprint(key);
    expect(fp1).toBe(fp2);
  });
});

describe('securityNumber', () => {
  it('formats fingerprint into grouped hex segments', () => {
    const fp = 'a'.repeat(64);
    const sn = securityNumber(fp);
    expect(sn).toBe('aaaa aaaa aaaa aaaa aaaa');
  });

  it('returns shorter string for shorter fingerprints', () => {
    const sn = securityNumber('abcd');
    expect(sn).toBe('abcd');
  });
});
