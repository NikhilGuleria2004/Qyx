import { describe, it, expect, beforeEach } from 'vitest';
import { WebAuthnService } from './webauthn.service';

describe('WebAuthnService', () => {
  let db: D1Database;
  let kv: KVNamespace;
  let service: WebAuthnService;
  let credentials: Record<string, unknown>[];
  let users: Record<string, unknown>[];
  let kvStore: Map<string, string>;

  beforeEach(() => {
    credentials = [];
    users = [];
    kvStore = new Map();

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT * FROM webauthn_credentials WHERE credential_id = ?')) {
              return credentials.find((c) => c.credential_id === args[0]) || null;
            }
            if (sql.includes('SELECT * FROM webauthn_credentials WHERE user_id = ? AND credential_id = ?')) {
              return credentials.find((c) => c.user_id === args[0] && c.credential_id === args[1]) || null;
            }
            if (sql.includes('SELECT organization_id FROM users WHERE id = ?')) {
              const user = users.find((u) => u.id === args[0]);
              return user ? { organization_id: user.organization_id } : null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT * FROM webauthn_credentials WHERE user_id = ?')) {
              return { results: credentials.filter((c) => c.user_id === args[0]) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO webauthn_credentials')) {
              credentials.push({
                id: args[0] as string,
                user_id: args[1] as string,
                organization_id: args[2] as string,
                credential_id: args[3] as string,
                public_key: args[4] as string,
                sign_count: args[5] as number,
                device_name: args[6] as string,
                platform: args[7] as string | null,
                created_at: args[8] as number,
                last_used_at: args[9] as number,
              });
              return { changes: 1 };
            }
            if (sql.includes('UPDATE webauthn_credentials SET last_used_at')) {
              const idx = credentials.findIndex((c) => c.user_id === args[1] && c.credential_id === args[2]);
              if (idx !== -1) {
                credentials[idx] = {
                  ...credentials[idx],
                  last_used_at: args[0] as number,
                  sign_count: (credentials[idx].sign_count as number) + 1,
                };
                return { changes: 1 };
              }
              return { changes: 0 };
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    kv = {
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
      get: async (key: string) => {
        return kvStore.get(key) || null;
      },
      delete: async (key: string) => {
        kvStore.delete(key);
      },
    } as unknown as KVNamespace;

    service = new WebAuthnService(db, kv);
  });

  it('starts registration and stores challenge in KV', async () => {
    const result = await service.startRegistration('usr_123', 'user@example.com', 'Test User', 'MacBook Pro', 'web');

    expect(result.challenge).toBeDefined();
    expect(result.userId).toBe('usr_123');
    expect(kvStore.size).toBe(1);

    const challengeKey = Array.from(kvStore.keys())[0];
    expect(challengeKey.startsWith('webauthn:register:')).toBe(true);

    const challengeData = JSON.parse(kvStore.get(challengeKey)!);
    expect(challengeData.userId).toBe('usr_123');
    expect(challengeData.email).toBe('user@example.com');
    expect(challengeData.deviceName).toBe('MacBook Pro');
    expect(challengeData.platform).toBe('web');
    expect(challengeData.type).toBe('registration');
  });

  it('starts authentication and stores challenge in KV', async () => {
    const result = await service.startAuthentication('usr_123', 'user@example.com', 'MacBook Pro', 'desktop');

    expect(result.challenge).toBeDefined();
    expect(result.userId).toBe('usr_123');

    const challengeKey = Array.from(kvStore.keys())[0];
    expect(challengeKey.startsWith('webauthn:auth:')).toBe(true);

    const challengeData = JSON.parse(kvStore.get(challengeKey)!);
    expect(challengeData.userId).toBe('usr_123');
    expect(challengeData.type).toBe('authentication');
  });

  it('verifies and stores credential', async () => {
    users.push({ id: 'usr_123', organization_id: 'org_123', email: 'user@example.com' });

    const credential = await service.verifyAndStoreCredential(
      'usr_123',
      'cred_abc123',
      'cHVibGljX2tleQ==',
      0,
      'MacBook Pro',
      'web'
    );

    expect(credential.id.startsWith('webauthn_')).toBe(true);
    expect(credential.user_id).toBe('usr_123');
    expect(credential.organization_id).toBe('org_123');
    expect(credential.credential_id).toBe('cred_abc123');
    expect(credential.public_key).toBe('cHVibGljX2tleQ==');
    expect(credential.sign_count).toBe(0);
    expect(credential.device_name).toBe('MacBook Pro');
    expect(credential.platform).toBe('web');
    expect(credentials.length).toBe(1);
  });

  it('rejects duplicate credential registration', async () => {
    users.push({ id: 'usr_123', organization_id: 'org_123', email: 'user@example.com' });

    await service.verifyAndStoreCredential('usr_123', 'cred_abc123', 'cHVibGljX2tleQ==', 0, 'Device 1');

    await expect(
      service.verifyAndStoreCredential('usr_123', 'cred_abc123', 'b3RoZXJfa2V5', 0, 'Device 2')
    ).rejects.toThrow('Credential already registered');
  });

  it('throws when storing credential for non-existent user', async () => {
    await expect(
      service.verifyAndStoreCredential('usr_nonexistent', 'cred_abc', 'key', 0, 'Device')
    ).rejects.toThrow('User not found');
  });

  it('verifies authentication and updates last_used_at', async () => {
    users.push({ id: 'usr_123', organization_id: 'org_123', email: 'user@example.com' });

    await service.verifyAndStoreCredential('usr_123', 'cred_abc123', 'cHVibGljX2tleQ==', 0, 'MacBook Pro');

    const originalCredential = credentials[0];
    const originalLastUsed = originalCredential.last_used_at;

    const verified = await service.verifyAuthentication('usr_123', 'cred_abc123');

    expect(verified).not.toBeNull();
    expect(verified!.credential_id).toBe('cred_abc123');

    const updatedCredential = credentials.find((c) => c.credential_id === 'cred_abc123');
    expect(updatedCredential!.last_used_at).toBeGreaterThanOrEqual(originalLastUsed as number);
    expect(updatedCredential!.sign_count).toBe(1);
  });

  it('returns null for unrecognized credential during authentication', async () => {
    const result = await service.verifyAuthentication('usr_123', 'cred_nonexistent');
    expect(result).toBeNull();
  });

  it('gets credentials by user', async () => {
    users.push(
      { id: 'usr_123', organization_id: 'org_123', email: 'user@example.com' },
      { id: 'usr_456', organization_id: 'org_123', email: 'other@example.com' }
    );

    await service.verifyAndStoreCredential('usr_123', 'cred_1', 'a2V5MQ==', 0, 'Device 1');
    await service.verifyAndStoreCredential('usr_123', 'cred_2', 'a2V5Mg==', 0, 'Device 2');
    await service.verifyAndStoreCredential('usr_456', 'cred_3', 'a2V5Mw==', 0, 'Other Device');

    const userCredentials = await service.getCredentialsByUser('usr_123');
    expect(userCredentials.length).toBe(2);
    userCredentials.forEach((cred) => {
      expect(cred.user_id).toBe('usr_123');
    });
  });

  it('returns empty array when user has no credentials', async () => {
    const result = await service.getCredentialsByUser('usr_no_creds');
    expect(result).toEqual([]);
  });

  it('stores credential with null platform when not provided', async () => {
    users.push({ id: 'usr_123', organization_id: 'org_123', email: 'user@example.com' });

    const credential = await service.verifyAndStoreCredential(
      'usr_123',
      'cred_abc',
      'key',
      0,
      'Device'
    );

    expect(credential.platform == null).toBe(true);
  });
});
