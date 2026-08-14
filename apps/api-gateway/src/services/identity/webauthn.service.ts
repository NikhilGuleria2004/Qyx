import { D1Database } from '@cloudflare/workers-types';

export interface WebAuthnCredential {
  id: string;
  user_id: string;
  organization_id: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  device_name: string;
  platform?: string;
  created_at: number;
  last_used_at?: number;
}

export class WebAuthnService {
  constructor(private db: D1Database, private kv: KVNamespace) {}

  async startRegistration(userId: string, email: string, displayName: string, deviceName: string, platform?: string): Promise<{ challenge: string; userId: string }> {
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const challengeId = `chal_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    
    await this.kv.put(`webauthn:register:${challengeId}`, JSON.stringify({
      userId,
      email,
      displayName,
      deviceName,
      platform,
      challenge,
      type: 'registration',
      expiresAt: Date.now() + (5 * 60 * 1000),
    }), { expirationTtl: 300 });
    
    return { challenge, userId };
  }

  async startAuthentication(userId: string, email: string, deviceName: string, platform?: string): Promise<{ challenge: string; userId: string }> {
    const challenge = crypto.randomUUID().replace(/-/g, '');
    const challengeId = `chal_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    
    await this.kv.put(`webauthn:auth:${challengeId}`, JSON.stringify({
      userId,
      email,
      deviceName,
      platform,
      challenge,
      type: 'authentication',
      expiresAt: Date.now() + (5 * 60 * 1000),
    }), { expirationTtl: 300 });
    
    return { challenge, userId };
  }

  async verifyAndStoreCredential(userId: string, credentialId: string, publicKey: string, signCount: number, deviceName: string, platform?: string): Promise<WebAuthnCredential> {
    const existing = await this.db.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').bind(credentialId).first();
    if (existing) {
      throw new Error('Credential already registered');
    }

    const id = `webauthn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const user = await this.db.prepare('SELECT organization_id FROM users WHERE id = ?').bind(userId).first() as { organization_id: string };
    
    if (!user) {
      throw new Error('User not found');
    }

    const now = Date.now();
    await this.db.prepare(
      'INSERT INTO webauthn_credentials (id, user_id, organization_id, credential_id, public_key, sign_count, device_name, platform, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, userId, user.organization_id, credentialId, publicKey, signCount, deviceName, platform || null, now, now).run();

    return {
      id,
      user_id: userId,
      organization_id: user.organization_id,
      credential_id: credentialId,
      public_key: publicKey,
      sign_count: signCount,
      device_name: deviceName,
      platform,
      created_at: now,
      last_used_at: now,
    };
  }

  async verifyAuthentication(userId: string, credentialId: string): Promise<WebAuthnCredential | null> {
    const result = await this.db.prepare('SELECT * FROM webauthn_credentials WHERE user_id = ? AND credential_id = ?').bind(userId, credentialId).first();
    if (result) {
      await this.db.prepare('UPDATE webauthn_credentials SET last_used_at = ?, sign_count = sign_count + 1 WHERE user_id = ? AND credential_id = ?').bind(Date.now(), userId, credentialId).run();
    }
    return result as WebAuthnCredential | null;
  }

  async getCredentialsByUser(userId: string): Promise<WebAuthnCredential[]> {
    const result = await this.db.prepare('SELECT * FROM webauthn_credentials WHERE user_id = ?').bind(userId).all();
    return result.results as unknown as WebAuthnCredential[];
  }
}
