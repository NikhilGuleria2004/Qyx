type Env = {
  PRIMARY_DB: D1Database;
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron === '*/5 * * * *') {
      await evaluateAlertRules(env);
    }
  },
};

async function evaluateAlertRules(env: Env): Promise<void> {
  try {
    const result = await env.PRIMARY_DB.prepare(
      "SELECT DISTINCT organization_id FROM alerts WHERE status = 'active' AND organization_id IS NOT NULL"
    ).all();

    const orgIds = (result.results as { organization_id: string }[]).map((r) => r.organization_id);

    for (const orgId of orgIds) {
      await evaluateOrgAlerts(env, orgId);
    }
  } catch (error) {
    console.error('Alert evaluation error:', error);
  }
}

async function evaluateOrgAlerts(env: Env, orgId: string): Promise<void> {
  const rulesResult = await env.PRIMARY_DB.prepare(
    "SELECT * FROM alerts WHERE status = 'active' AND organization_id = ?"
  ).bind(orgId).all();

  const rules = rulesResult.results as Array<{
    id: string;
    rule_name: string;
    severity: string;
    service: string | null;
    threshold: string;
  }>;

  for (const rule of rules) {
    try {
      const threshold = JSON.parse(rule.threshold) as {
        metric: string;
        operator: string;
        value: number;
        window_minutes?: number;
        service?: string;
      };
      const windowMinutes = threshold.window_minutes || 5;
      const windowStart = Date.now() - windowMinutes * 60 * 1000;

      let shouldFire = false;
      let metricValue: Record<string, unknown> | null = null;

      if (threshold.metric === 'failed_login_rate' && rule.service === 'identity') {
        const countResult = await env.PRIMARY_DB.prepare(
          'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
        ).bind('identity', 'login', 'error', windowStart).first();
        const count = (countResult as { count: number }).count || 0;
        const rate = count / windowMinutes;
        if (rate > threshold.value) {
          shouldFire = true;
          metricValue = { metric: 'failed_login_rate', value: rate, threshold: threshold.value, window_minutes: windowMinutes };
        }
      }

      if (threshold.metric === 'cross_org_denial_count') {
        const countResult = await env.PRIMARY_DB.prepare(
          'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND created_at >= ?'
        ).bind('cross_org_access_denied', windowStart).first();
        const count = (countResult as { count: number }).count || 0;
        if (count > threshold.value) {
          shouldFire = true;
          metricValue = { metric: 'cross_org_denial_count', value: count, threshold: threshold.value };
        }
      }

      if (threshold.metric === 'permission_denied_rate') {
        const countResult = await env.PRIMARY_DB.prepare(
          'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
        ).bind('api-gateway', 'rbac_check', 'forbidden', windowStart).first();
        const count = (countResult as { count: number }).count || 0;
        if (count > threshold.value) {
          shouldFire = true;
          metricValue = { metric: 'permission_denied_rate', value: count, threshold: threshold.value };
        }
      }

      if (threshold.metric === 'new_device_count') {
        const countResult = await env.PRIMARY_DB.prepare(
          'SELECT COUNT(*) as count FROM devices WHERE organization_id = ? AND created_at >= ?'
        ).bind(orgId, windowStart).first();
        const count = (countResult as { count: number }).count || 0;
        if (count > threshold.value) {
          shouldFire = true;
          metricValue = { metric: 'new_device_count', value: count, threshold: threshold.value };
        }
      }

      if (shouldFire) {
        await fireAlert(env, rule.id, metricValue);
      }
    } catch (error) {
      console.error(`Failed to evaluate rule ${rule.id}:`, error);
    }
  }
}

async function fireAlert(env: Env, alertId: string, metricValue: Record<string, unknown> | null): Promise<void> {
  const alertResult = await env.PRIMARY_DB.prepare(
    "SELECT * FROM alerts WHERE id = ? AND status = 'active'"
  ).bind(alertId).first();

  if (!alertResult) return;

  const alert = alertResult as { id: string; organization_id: string | null; rule_name: string; severity: string };
  const eventId = `ale_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();

  await env.PRIMARY_DB.prepare(
    `INSERT INTO alert_events (id, alert_id, organization_id, triggered_at, metric_value, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    eventId,
    alertId,
    alert.organization_id || null,
    now,
    metricValue ? JSON.stringify(metricValue) : null,
    'firing',
    null
  ).run();

  await env.PRIMARY_DB.prepare(
    'UPDATE alerts SET last_fired_at = ? WHERE id = ?'
  ).bind(now, alertId).run();
}
