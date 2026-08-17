import { describe, it, expect } from 'vitest';
import { assert, asyncProperty, constantFrom, integer, property, uint8Array } from 'fast-check';
import {
  generateKeyPair,
  sharedSecret,
  encrypt,
  decrypt,
  sign,
  verify,
  randomBytes,
  fingerprint,
} from './index.ts';

describe('fuzz — encrypt/decrypt round-trip', () => {
  it('round-trips random plaintexts through AES-256-GCM', async () => {
    await assert(
      asyncProperty(uint8Array({ minLength: 0, maxLength: 1024 }), async (plaintext) => {
        const key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        const { ciphertext, nonce } = await encrypt(key, plaintext);
        const decrypted = await decrypt(key, ciphertext, nonce);
        expect(decrypted).toEqual(plaintext);
      })
    );
  });
});

describe('fuzz — sign/verify round-trip', () => {
  it('verifies random messages signed with Ed25519', async () => {
    await assert(
      asyncProperty(uint8Array({ minLength: 0, maxLength: 1024 }), async (message) => {
        const { publicKey, privateKey } = await generateKeyPair('ed25519');
        const signature = await sign(privateKey, message);
        const valid = await verify(publicKey, signature, message);
        expect(valid).toBe(true);
      })
    );
  });
});

describe('fuzz — shared secret symmetry', () => {
  it('produces matching secrets for random X25519 key pairs', async () => {
    await assert(
      asyncProperty(constantFrom('x25519'), async () => {
        const alice = await generateKeyPair('x25519');
        const bob = await generateKeyPair('x25519');
        const secretA = await sharedSecret(alice.privateKey, bob.publicKey);
        const secretB = await sharedSecret(bob.privateKey, alice.publicKey);
        expect(secretA).toEqual(secretB);
      })
    );
  });
});

describe('fuzz — randomBytes length', () => {
  it('always returns the requested length', () => {
    assert(
      property(integer({ min: 0, max: 4096 }), (len) => {
        const bytes = randomBytes(len);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(len);
      })
    );
  });
});

describe('fuzz — fingerprint determinism', () => {
  it('produces identical fingerprints for identical keys', async () => {
    await assert(
      asyncProperty(uint8Array({ minLength: 1, maxLength: 256 }), async (key) => {
        const fp1 = await fingerprint(key);
        const fp2 = await fingerprint(key);
        expect(fp1).toBe(fp2);
      })
    );
  });
});
