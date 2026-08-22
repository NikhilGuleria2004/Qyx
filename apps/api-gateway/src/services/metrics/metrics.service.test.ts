import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let db: D1Database;
  let service: MetricsService;
  let events: Record<string, unknown>[];

  beforeEach(() => {
    events = [];

    db = {
      prepare: (sql: string) => {
        const statement = {
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (sql.includes('COUNT(*) as count FROM metrics_events')) {
                let filtered = [...events];
                const conditions: Array<(e: Record<string, unknown>) => boolean> = [];
                let argIdx = 0;

                for (let i = 0; i < sql.length; i++) {
                  if (sql[i] === '?') {
                    const param = args[argIdx];
                    const before = sql.substring(0, i);

                    if (before.endsWith('service = ')) {
                      conditions.push((e) => e.service === param);
                    } else if (before.endsWith('status = ')) {
                      conditions.push((e) => e.status === param);
                    } else if (before.endsWith('operation = ')) {
                      conditions.push((e) => e.operation === param);
                    } else if (before.endsWith('created_at >= ')) {
                      conditions.push((e) => (e.created_at as number) >= (param as number));
                    } else if (before.endsWith('created_at <= ')) {
                      conditions.push((e) => (e.created_at as number) <= (param as number));
                    }
                    argIdx++;
                  }
                }

                filtered = filtered.filter((e) => conditions.every((c) => c(e)));
                return { count: filtered.length };
              }
              if (sql.includes('COUNT(*) as count FROM organizations')) {
                return { count: 5 };
              }
              if (sql.includes("COUNT(*) as count FROM users WHERE status = ?")) {
                return { count: 100 };
              }
              if (sql.includes("COUNT(*) as count FROM users WHERE organization_id = ?")) {
                return { count: 50 };
              }
              if (sql.includes('COUNT(*) as count FROM organizations WHERE status = ?')) {
                return { count: 3 };
              }
              if (sql.includes('COUNT(*) as count FROM devices WHERE status = ?')) {
                return { count: 10 };
              }
              if (sql.includes('COUNT(*) as count FROM sessions WHERE organization_id = ?')) {
                return { count: 25 };
              }
              if (sql.includes('AVG(latency_ms)')) {
                const latencies = events.map((e) => e.latency_ms as number);
                const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
                return { avg_latency: avg };
              }
              return { count: 0 };
            },
            all: async () => {
              if (sql.includes('latency_ms FROM metrics_events')) {
                let filtered = [...events];
                if (sql.includes('service = ?')) {
                  filtered = filtered.filter((e) => e.service === args[0]);
                }
                return { results: filtered.map((e) => ({ latency_ms: e.latency_ms })) };
              }
              return { results: [] };
            },
            run: async () => {
              if (sql.includes('INSERT INTO metrics_events')) {
                events.push({
                  id: args[0] as string,
                  service: args[1] as string,
                  operation: args[2] as string,
                  organization_id: args[3] as string | null,
                  user_id: args[4] as string | null,
                  status: args[5] as string,
                  latency_ms: args[6] as number,
                  metadata: args[7] as string | null,
                  created_at: args[8] as number,
                });
                return { changes: 1 };
              }
              return { changes: 1 };
            },
          }),
          first: async () => {
            if (sql.includes('COUNT(*) as count FROM organizations')) {
              return { count: 5 };
            }
            if (sql.includes("COUNT(*) as count FROM users WHERE status = ?")) {
              return { count: 100 };
            }
            if (sql.includes('COUNT(*) as count FROM organizations WHERE status = ?')) {
              return { count: 3 };
            }
            if (sql.includes('COUNT(*) as count FROM devices WHERE status = ?')) {
              return { count: 10 };
            }
            return { count: 0 };
          },
        };
        return statement as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;

    service = new MetricsService(db);
  });

  it('records a metric event', async () => {
    await service.recordEvent({
      service: 'identity',
      operation: 'login',
      organization_id: 'org_123',
      user_id: 'usr_1',
      status: 'success',
      latency_ms: 150,
      metadata: { method: 'password' },
    });

    expect(events.length).toBe(1);
    expect(events[0].service).toBe('identity');
    expect(events[0].operation).toBe('login');
    expect(events[0].status).toBe('success');
  });

  it('calculates golden signals for a service', async () => {
    const now = Date.now();
    events.push(
      { service: 'identity', operation: 'login', status: 'success', latency_ms: 100, created_at: now - 60000 },
      { service: 'identity', operation: 'login', status: 'success', latency_ms: 200, created_at: now - 120000 },
      { service: 'identity', operation: 'login', status: 'error', latency_ms: 50, created_at: now - 180000 },
      { service: 'identity', operation: 'login', status: 'success', latency_ms: 150, created_at: now - 240000 }
    );

    const signals = await service.getGoldenSignals('identity', 5);

    expect(signals.service).toBe('identity');
    expect(signals.request_rate).toBeGreaterThan(0);
    expect(signals.error_rate).toBeGreaterThan(0);
    expect(signals.latency_p50).toBeGreaterThan(0);
  });

  it('gets golden signals for all services', async () => {
    const signals = await service.getAllGoldenSignals(5);
    expect(signals.length).toBe(7);
    const serviceNames = signals.map((s) => s.service);
    expect(serviceNames).toContain('api-gateway');
    expect(serviceNames).toContain('messaging');
    expect(serviceNames).toContain('identity');
  });

  it('gets platform metrics', async () => {
    const now = Date.now();
    events.push(
      { service: 'identity', operation: 'login', status: 'error', created_at: now - 3600000 },
      { service: 'identity', operation: 'login', status: 'error', created_at: now - 7200000 }
    );

    const metrics = await service.getPlatformMetrics();

    expect(metrics.total_organizations).toBe(5);
    expect(metrics.active_users).toBe(100);
    expect(metrics.failed_logins_24h).toBe(2);
  });

  it('calculates security metrics for an org', async () => {
    const now = Date.now();
    events.push(
      { service: 'identity', operation: 'login', status: 'error', created_at: now - 1800000 },
      { service: 'api-gateway', operation: 'cross_org_access_denied', created_at: now - 2400000 },
      { service: 'identity', operation: 'sso_callback', status: 'error', created_at: now - 3000000 }
    );

    const metrics = await service.getSecurityMetrics('org_123');

    expect(metrics.failed_login_rate).toBeGreaterThanOrEqual(0);
    expect(metrics.cross_org_access_denial_count).toBe(1);
    expect(metrics.sso_error_count).toBe(1);
  });

  it('handles empty metrics gracefully', async () => {
    const signals = await service.getGoldenSignals('identity', 5);
    expect(signals.request_rate).toBe(0);
    expect(signals.error_rate).toBe(0);
    expect(signals.latency_p50).toBe(0);
    expect(signals.latency_p95).toBe(0);
    expect(signals.latency_p99).toBe(0);
  });

  it('calculates latency percentiles correctly', async () => {
    const now = Date.now();
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    latencies.forEach((lat, i) => {
      events.push({ service: 'messaging', operation: 'send', status: 'success', latency_ms: lat, created_at: now - (i + 1) * 10000 });
    });

    const signals = await service.getGoldenSignals('messaging', 5);
    expect(signals.latency_p50).toBeGreaterThan(0);
    expect(signals.latency_p95).toBeGreaterThan(signals.latency_p50);
  });
});
