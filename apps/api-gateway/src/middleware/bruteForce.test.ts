import { describe, it, expect, beforeEach } from 'vitest';
import { BruteForceProtection, getBruteForceIdentifier } from './bruteForce';

function createMockKV() {
  const store = new Map<string, { value: string; expires: number }>();

  return {
    store,
    get: async (key: string, type?: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expires < Date.now()) {
        store.delete(key);
        return null;
      }
      if (type === 'json') return JSON.parse(entry.value);
      return entry.value;
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expires = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : Date.now() + 3600000;
      store.set(key, { value, expires });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe('BruteForceProtection (Phase 15)', () => {
  let kv: ReturnType<typeof createMockKV>;
  let bruteForce: BruteForceProtection;

  beforeEach(() => {
    kv = createMockKV();
    bruteForce = new BruteForceProtection(kv);
  });

  it('allows first attempt', async () => {
    const status = await bruteForce.isLocked('test@example.com');
    expect(status.locked).toBe(false);
    expect(status.retryAfter).toBe(0);
  });

  it('locks after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await bruteForce.recordFailure('test@example.com');
    }

    const status = await bruteForce.isLocked('test@example.com');
    expect(status.locked).toBe(true);
    expect(status.retryAfter).toBeGreaterThan(0);
  });

  it('resets on successful login', async () => {
    for (let i = 0; i < 4; i++) {
      await bruteForce.recordFailure('test@example.com');
    }

    await bruteForce.recordSuccess('test@example.com');

    const status = await bruteForce.isLocked('test@example.com');
    expect(status.locked).toBe(false);
  });

  it('increases lockout duration with more attempts', async () => {
    const identifier = 'test@example.com';

    for (let i = 0; i < 5; i++) {
      await bruteForce.recordFailure(identifier);
    }
    const first = await bruteForce.isLocked(identifier);
    expect(first.retryAfter).toBe(60);

    await bruteForce.recordFailure(identifier);
    const second = await bruteForce.isLocked(identifier);
    expect(second.retryAfter).toBe(120);

    await bruteForce.recordFailure(identifier);
    const third = await bruteForce.isLocked(identifier);
    expect(third.retryAfter).toBe(240);
  });

  it('tracks different identifiers independently', async () => {
    for (let i = 0; i < 5; i++) {
      await bruteForce.recordFailure('user1@example.com');
    }

    const status1 = await bruteForce.isLocked('user1@example.com');
    expect(status1.locked).toBe(true);

    const status2 = await bruteForce.isLocked('user2@example.com');
    expect(status2.locked).toBe(false);
  });
});

describe('getBruteForceIdentifier', () => {
  it('combines IP and email', () => {
    const mockCtx = {
      req: {
        header: (name: string) => {
          if (name === 'CF-Connecting-IP') return '192.168.1.1';
          return null;
        },
      },
    } as any;

    const identifier = getBruteForceIdentifier(mockCtx, 'test@example.com');
    expect(identifier).toBe('192.168.1.1:test@example.com');
  });

  it('lowercases email', () => {
    const mockCtx = {
      req: {
        header: (name: string) => {
          if (name === 'CF-Connecting-IP') return '10.0.0.1';
          return null;
        },
      },
    } as any;

    const identifier = getBruteForceIdentifier(mockCtx, 'Test@Example.COM');
    expect(identifier).toBe('10.0.0.1:test@example.com');
  });

  it('uses IP only when no email provided', () => {
    const mockCtx = {
      req: {
        header: (name: string) => {
          if (name === 'CF-Connecting-IP') return '10.0.0.1';
          return null;
        },
      },
    } as any;

    const identifier = getBruteForceIdentifier(mockCtx);
    expect(identifier).toBe('10.0.0.1');
  });
});
