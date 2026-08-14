import { Context } from 'hono';

export async function orgScope(c: Context, next: () => Promise<void>) {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
      401
    );
  }

  const resourceOrgId = c.req.param('orgId') || c.req.query('orgId');
  
  if (resourceOrgId && resourceOrgId !== (user as { organization_id: string }).organization_id) {
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
      { error: { code: 'ORG_SCOPE_VIOLATION', message: 'Resource not found or not accessible.', request_id: crypto.randomUUID() } },
      403
    );
  }

  c.set('orgId', (user as { organization_id: string }).organization_id);
  await next();
}
