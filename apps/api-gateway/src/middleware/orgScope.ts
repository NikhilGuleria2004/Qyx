import { Context } from 'hono';
import { createLogger } from '../utils/logger';
import { MetricsService } from '../services/metrics/metrics.service';

export async function orgScope(c: Context, next: () => Promise<void>) {
  const requestId = c.get('requestId') as string;
  const logger = createLogger(requestId);
  const user = c.get('user');
  if (!user) {
    logger.warn('Unauthenticated org access attempt', { path: c.req.path, method: c.req.method });
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: requestId } },
      401
    );
  }

  const resourceOrgId = c.req.param('orgId') || c.req.query('orgId');
  
  if (resourceOrgId && resourceOrgId !== (user as { organization_id: string }).organization_id) {
        logger.warn('Cross-org access denied', {
      user_org: (user as { organization_id: string }).organization_id,
      target_org: resourceOrgId,
      path: c.req.path,
      method: c.req.method,
    });

    if (c.env && c.env.PRIMARY_DB) {
      const metricsService = new MetricsService(c.env.PRIMARY_DB);
      metricsService.recordEvent({
        service: 'api-gateway',
        operation: 'cross_org_access_denied',
        organization_id: (user as { organization_id: string }).organization_id,
        user_id: (user as { user_id: string }).user_id,
        status: 'error',
        latency_ms: 0,
        metadata: { target_org_id: resourceOrgId, route: c.req.path, method: c.req.method },
      }).catch(() => {});
    }

    const auditEvent = {
      id: `aud_${crypto.randomUUID()}`,
      organization_id: (user as { organization_id: string }).organization_id,
      actor_id: (user as { user_id: string }).user_id,
      event_type: 'cross_org_access_denied',
      metadata: { target_org_id: resourceOrgId, route: c.req.path, method: c.req.method },
      created_at: Date.now(),
    };
    
    try {
      await c.env.PRIMARY_DB.prepare(
        'INSERT INTO audit_events (id, organization_id, actor_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(auditEvent.id, auditEvent.organization_id, auditEvent.actor_id, auditEvent.event_type, JSON.stringify(auditEvent.metadata), auditEvent.created_at).run();
    } catch {
      // audit insert failed — continue with access denial
    }

    return c.json(
      { error: { code: 'ORG_SCOPE_VIOLATION', message: 'Resource not found or not accessible.', request_id: requestId } },
      403
    );
  }

  c.set('orgId', (user as { organization_id: string }).organization_id);
  await next();
}
