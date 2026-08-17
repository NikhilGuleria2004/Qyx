import { Context } from 'hono';
import { MetricsService } from '../services/metrics/metrics.service';

export async function metricsMiddleware(c: Context, next: () => Promise<void>) {
  const start = Date.now();
  const service = c.req.path.split('/')[2] || 'api-gateway';
  const operation = `${c.req.method.toLowerCase()}:${c.req.path}`;

  await next();

  const latency = Date.now() - start;
  const status = c.res.status < 400 ? 'success' : 'error';
  const requestId = c.get('requestId') as string || '';
  const user = c.get('user') as { user_id?: string; organization_id?: string } | undefined;

  if (c.env && c.env.PRIMARY_DB) {
    const metricsService = new MetricsService(c.env.PRIMARY_DB);
    metricsService.recordEvent({
      service,
      operation,
      organization_id: user?.organization_id,
      user_id: user?.user_id,
      status,
      latency_ms: latency,
      metadata: {
        request_id: requestId,
        method: c.req.method,
        path: c.req.path,
        status_code: c.res.status,
      },
    }).catch(() => {});
  }
}
