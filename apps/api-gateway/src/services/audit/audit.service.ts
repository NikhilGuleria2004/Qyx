import { D1Database } from '@cloudflare/workers-types';

export interface AuditEvent {
  id: string;
  organization_id: string;
  actor_id?: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: number;
}

export class AuditService {
  constructor(private db: D1Database) {}

  async log(event: Omit<AuditEvent, 'id' | 'created_at'>): Promise<void> {
    const id = `aud_${crypto.randomUUID()}`;
    const now = Date.now();
    
    const safeMetadata = event.metadata ? this.sanitizeMetadata(event.metadata) : undefined;
    
    try {
      await this.db.prepare(
        'INSERT INTO audit_events (id, organization_id, actor_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        event.organization_id,
        event.actor_id || null,
        event.event_type,
        safeMetadata ? JSON.stringify(safeMetadata) : null,
        now
      ).run();
    } catch {
      // audit insert failed — continue without blocking the request
    }
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'password_hash', 'mfa_secret', 'secret', 'key', 'private_key', 'encryption_key', 'ciphertext', 'plaintext', 'token', 'refresh_token', 'access_token'];
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}
