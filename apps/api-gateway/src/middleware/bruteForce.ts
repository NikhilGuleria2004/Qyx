import { Context } from 'hono';

const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_SECONDS = 60;
const MAX_LOCKOUT_SECONDS = 3600;

export class BruteForceProtection {
  constructor(private kv: KVNamespace) {}

  private getKey(identifier: string): string {
    return `bruteforce:${identifier}`;
  }

  async isLocked(identifier: string): Promise<{ locked: boolean; retryAfter: number }> {
    try {
      const data = await this.kv.get(this.getKey(identifier), 'json');
      if (!data) return { locked: false, retryAfter: 0 };

      const { attempts, lockedUntil } = data as { attempts: number; lockedUntil: number };
      const now = Date.now();

      if (lockedUntil && now < lockedUntil) {
        return { locked: true, retryAfter: Math.ceil((lockedUntil - now) / 1000) };
      }

      if (lockedUntil && now >= lockedUntil) {
        await this.kv.delete(this.getKey(identifier));
        return { locked: false, retryAfter: 0 };
      }

      if (attempts >= MAX_ATTEMPTS) {
        const lockoutSeconds = Math.min(BASE_LOCKOUT_SECONDS * Math.pow(2, attempts - MAX_ATTEMPTS), MAX_LOCKOUT_SECONDS);
        const lockedUntil = now + lockoutSeconds * 1000;
        await this.kv.put(this.getKey(identifier), JSON.stringify({ attempts, lockedUntil }), { expirationTtl: MAX_LOCKOUT_SECONDS + 60 });
        return { locked: true, retryAfter: lockoutSeconds };
      }

      return { locked: false, retryAfter: 0 };
    } catch {
      return { locked: false, retryAfter: 0 };
    }
  }

  async recordFailure(identifier: string): Promise<void> {
    try {
      const data = await this.kv.get(this.getKey(identifier), 'json');
      const attempts = data ? (data as { attempts: number }).attempts + 1 : 1;

      let lockoutSeconds = 0;
      if (attempts >= MAX_ATTEMPTS) {
        lockoutSeconds = Math.min(BASE_LOCKOUT_SECONDS * Math.pow(2, attempts - MAX_ATTEMPTS), MAX_LOCKOUT_SECONDS);
      }

      const lockedUntil = lockoutSeconds > 0 ? Date.now() + lockoutSeconds * 1000 : 0;
      const ttl = Math.max(MAX_LOCKOUT_SECONDS + 60, lockoutSeconds + 60);

      await this.kv.put(
        this.getKey(identifier),
        JSON.stringify({ attempts, lockedUntil }),
        { expirationTtl: ttl }
      );
    } catch {
      // KV write failed, allow request
    }
  }

  async recordSuccess(identifier: string): Promise<void> {
    try {
      await this.kv.delete(this.getKey(identifier));
    } catch {
      // KV delete failed
    }
  }
}

export function getBruteForceIdentifier(c: Context, email?: string): string {
  const ip = c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  return email ? `${ip}:${email.toLowerCase()}` : ip;
}
