import { D1Database } from '@cloudflare/workers-types';

export interface AuditEvent {
  id: string;
  organization_id: string;
  actor_id?: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: number;
}

export interface ListAuditOptions {
  eventType?: string;
  actorId?: string;
  limit?: number;
  cursor?: number;
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

  async listByOrg(organizationId: string, options: ListAuditOptions = {}): Promise<{ events: AuditEvent[]; nextCursor?: number }> {
    const { eventType, actorId, limit = 50, cursor } = options;

    const conditions: string[] = ['organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (eventType) {
      conditions.push('event_type = ?');
      params.push(eventType);
    }

    if (actorId) {
      conditions.push('actor_id = ?');
      params.push(actorId);
    }

    if (cursor) {
      conditions.push('created_at < ?');
      params.push(cursor);
    }

    const whereClause = conditions.join(' AND ');
    const sql = `SELECT id, organization_id, actor_id, event_type, metadata, created_at FROM audit_events WHERE ${whereClause} ORDER BY created_at DESC LIMIT ?`;

    const result = await this.db.prepare(sql).bind(...params, limit).all();
    const rows = result.results as Array<{ id: string; organization_id: string; actor_id?: string; event_type: string; metadata?: string; created_at: number }>;

    const events: AuditEvent[] = rows.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      actor_id: row.actor_id,
      event_type: row.event_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    }));

    const nextCursor = events.length === limit ? events[events.length - 1].created_at : undefined;

    return { events, nextCursor };
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
