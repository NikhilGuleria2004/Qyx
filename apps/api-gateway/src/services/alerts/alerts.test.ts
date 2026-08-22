import { describe, it, expect, beforeEach } from 'vitest';
import { AlertsService } from './alerts.service';

describe('Alert generation triggers', () => {
  let db: D1Database;
  let service: AlertsService;
  let metricsEvents: Record<string, unknown>[];
  let alertRules: Record<string, unknown>[];
  let alertEvents: Record<string, unknown>[];
  let devices: Record<string, unknown>[];

  beforeEach(() => {
    metricsEvents = [];
    alertRules = [];
    alertEvents = [];
    devices = [];

    let eventCounter = 0;

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT COUNT(*) as count FROM metrics_events')) {
              let filtered = metricsEvents;
              if (sql.includes("service = 'identity'") && sql.includes("operation = 'login'") && sql.includes("status = 'error'")) {
                filtered = metricsEvents.filter((e) => e.service === 'identity' && e.operation === 'login' && e.status === 'error' && (e.created_at as number) >= (args[3] as number));
              } else if (sql.includes("operation = 'cross_org_access_denied'")) {
                filtered = metricsEvents.filter((e) => e.operation === 'cross_org_access_denied' && (e.created_at as number) >= (args[1] as number));
              } else if (sql.includes("operation = 'rbac_check'") && sql.includes("status = 'forbidden'")) {
                filtered = metricsEvents.filter((e) => e.operation === 'rbac_check' && e.status === 'forbidden' && (e.created_at as number) >= (args[3] as number));
              }
              return { count: filtered.length };
            }
            if (sql.includes('SELECT COUNT(*) as count FROM devices')) {
              return { count: devices.filter((d) => d.organization_id === args[0] && (d.created_at as number) >= (args[1] as number)).length };
            }
            if (sql.includes('SELECT * FROM alerts WHERE id = ?')) {
              return alertRules.find((r) => r.id === args[0]) || null;
            }
            return null;
          },
          all: async () => {
            if (sql.includes('SELECT DISTINCT organization_id FROM alerts')) {
              return { results: alertRules.filter((r) => r.status === 'active' && r.organization_id).map((r) => ({ organization_id: r.organization_id })) };
            }
            if (sql.includes('WHERE status = ?') || sql.includes("WHERE status = 'active'")) {
              if (sql.includes('organization_id = ?')) {
                return { results: alertRules.filter((r) => r.status === 'active' && r.organization_id === args[0]) };
              }
              return { results: alertRules.filter((r) => r.status === 'active') };
            }
            if (sql.includes('SELECT * FROM alerts')) {
              return { results: alertRules.filter((r) => r.organization_id === args[0] || r.organization_id === null) };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO alert_events')) {
              alertEvents.push({
                id: args[0] as string,
                alert_id: args[1] as string,
                organization_id: args[2] as string | null,
                triggered_at: args[3] as number,
                metric_value: args[4] as string | null,
                status: args[5] as string,
                metadata: args[6] as string | null,
              });
            }
            if (sql.includes('UPDATE alerts SET last_fired_at')) {
              const rule = alertRules.find((r) => r.id === args[1]);
              if (rule) rule.last_fired_at = args[0] as number;
            }
            if (sql.includes('INSERT INTO alerts')) {
              alertRules.push({
                id: args[0] as string,
                organization_id: args[1] as string | null,
                rule_name: args[2] as string,
                severity: args[3] as string,
                service: args[4] as string | null,
                threshold: args[5] as string,
                status: args[6] as string,
                created_at: args[7] as number,
              });
            }
            if (sql.includes('INSERT INTO metrics_events')) {
              metricsEvents.push({
                id: args[0] as string,
                service: args[1] as string,
                operation: args[2] as string,
                organization_id: args[3] as string,
                status: args[4] as string,
                created_at: args[5] as number,
              });
              eventCounter++;
            }
            if (sql.includes('INSERT INTO devices')) {
              devices.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                created_at: args[2] as number,
              });
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new AlertsService(db);
  });

  it('fires alert when failed login rate exceeds threshold', async () => {
    const now = Date.now();
    const orgId = 'org_test';

    const rule = await service.createRule({
      rule_name: 'High Failed Login Rate',
      severity: 'high',
      service: 'identity',
      threshold: JSON.stringify({ metric: 'failed_login_rate', operator: '>', value: 0.5, window_minutes: 5 }),
      organization_id: orgId,
    });

    for (let i = 0; i < 10; i++) {
      await db.prepare(
        'INSERT INTO metrics_events (id, service, operation, organization_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`met_${i}`, 'identity', 'login', orgId, 'error', now - 60000).run();
    }

    const firedEvents = await service.evaluateRules(orgId);

    expect(firedEvents.length).toBeGreaterThan(0);
    expect(firedEvents[0].alert_id).toBe(rule.id);
  });

  it('fires alert when cross-org denial count exceeds threshold', async () => {
    const now = Date.now();
    const orgId = 'org_test';

    const rule = await service.createRule({
      rule_name: 'Cross-org Access Attempts',
      severity: 'critical',
      service: 'api-gateway',
      threshold: JSON.stringify({ metric: 'cross_org_denial_count', operator: '>', value: 3, window_minutes: 5 }),
      organization_id: orgId,
    });

    for (let i = 0; i < 5; i++) {
      await db.prepare(
        'INSERT INTO metrics_events (id, service, operation, organization_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`met_${i}`, 'api-gateway', 'cross_org_access_denied', orgId, 'error', now - 60000).run();
    }

    const firedEvents = await service.evaluateRules(orgId);

    expect(firedEvents.length).toBeGreaterThan(0);
    expect(firedEvents[0].alert_id).toBe(rule.id);
  });

  it('does not fire alert when metrics are below threshold', async () => {
    const orgId = 'org_test';

    await service.createRule({
      rule_name: 'High Failed Login Rate',
      severity: 'high',
      service: 'identity',
      threshold: JSON.stringify({ metric: 'failed_login_rate', operator: '>', value: 100, window_minutes: 5 }),
      organization_id: orgId,
    });

    const firedEvents = await service.evaluateRules(orgId);

    expect(firedEvents.length).toBe(0);
  });

  it('fires alert when permission denied rate exceeds threshold', async () => {
    const now = Date.now();
    const orgId = 'org_test';

    const rule = await service.createRule({
      rule_name: 'Permission Denied Spike',
      severity: 'medium',
      service: 'api-gateway',
      threshold: JSON.stringify({ metric: 'permission_denied_rate', operator: '>', value: 5, window_minutes: 5 }),
      organization_id: orgId,
    });

    for (let i = 0; i < 10; i++) {
      await db.prepare(
        'INSERT INTO metrics_events (id, service, operation, organization_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`met_${i}`, 'api-gateway', 'rbac_check', orgId, 'forbidden', now - 60000).run();
    }

    const firedEvents = await service.evaluateRules(orgId);

    expect(firedEvents.length).toBeGreaterThan(0);
    expect(firedEvents[0].alert_id).toBe(rule.id);
  });

  it('evaluates rules across multiple organizations', async () => {
    const now = Date.now();
    const org1 = 'org_1';
    const org2 = 'org_2';

    await service.createRule({
      rule_name: 'High Failed Login Rate',
      severity: 'high',
      service: 'identity',
      threshold: JSON.stringify({ metric: 'failed_login_rate', operator: '>', value: 0.5, window_minutes: 5 }),
      organization_id: org1,
    });

    await service.createRule({
      rule_name: 'High Failed Login Rate',
      severity: 'high',
      service: 'identity',
      threshold: JSON.stringify({ metric: 'failed_login_rate', operator: '>', value: 0.5, window_minutes: 5 }),
      organization_id: org2,
    });

    for (let i = 0; i < 10; i++) {
      await db.prepare(
        'INSERT INTO metrics_events (id, service, operation, organization_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`met_org1_${i}`, 'identity', 'login', org1, 'error', now - 60000).run();
      await db.prepare(
        'INSERT INTO metrics_events (id, service, operation, organization_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`met_org2_${i}`, 'identity', 'login', org2, 'error', now - 60000).run();
    }

    const firedEvents1 = await service.evaluateRules(org1);
    const firedEvents2 = await service.evaluateRules(org2);

    expect(firedEvents1.length).toBeGreaterThan(0);
    expect(firedEvents2.length).toBeGreaterThan(0);
  });
});
