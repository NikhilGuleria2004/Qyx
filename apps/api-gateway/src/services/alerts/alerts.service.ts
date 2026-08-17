import { D1Database } from '@cloudflare/workers-types';
import { MetricsService } from '../metrics/metrics.service';
import { AuditService } from '../audit/audit.service';
import { AlertRule, AlertEvent, AlertSummary } from './alerts.types';

type AlertRuleRow = {
  id: string;
  organization_id: string | null;
  rule_name: string;
  severity: string;
  service: string | null;
  threshold: string;
  status: string;
  last_fired_at: number | null;
  created_at: number;
};

type AlertEventRow = {
  id: string;
  alert_id: string;
  organization_id: string | null;
  triggered_at: number;
  resolved_at: number | null;
  metric_value: string | null;
  status: string;
  metadata: string | null;
};

export class AlertsService {
  constructor(private db: D1Database) {}

  async createRule(data: { rule_name: string; severity: string; service?: string; threshold: string; organization_id?: string }): Promise<AlertRule> {
    const id = `alt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    await this.db.prepare(
      `INSERT INTO alerts (id, organization_id, rule_name, severity, service, threshold, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, data.organization_id || null, data.rule_name, data.severity, data.service || null, data.threshold, 'active', now).run();

    const rule = await this.getRule(id);
    if (!rule) throw new Error('Failed to create alert rule');
    return rule;
  }

  async listRules(organizationId?: string): Promise<AlertRule[]> {
    let query = 'SELECT * FROM alerts';
    const params: unknown[] = [];

    if (organizationId) {
      query += ' WHERE organization_id = ? OR organization_id IS NULL';
      params.push(organizationId);
    }

    query += ' ORDER BY created_at DESC';
    const result = await this.db.prepare(query).bind(...params).all();
    return (result.results as AlertRuleRow[]).map(this.mapRule);
  }

  async getRule(id: string): Promise<AlertRule | null> {
    const result = await this.db.prepare('SELECT * FROM alerts WHERE id = ?').bind(id).first();
    const row = result as AlertRuleRow | undefined;
    return row ? this.mapRule(row) : null;
  }

  async updateRule(id: string, data: { rule_name?: string; severity?: string; service?: string | null; threshold?: string; status?: string }): Promise<AlertRule | null> {
    const existing = await this.getRule(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (data.rule_name !== undefined) { sets.push('rule_name = ?'); values.push(data.rule_name); }
    if (data.severity !== undefined) { sets.push('severity = ?'); values.push(data.severity); }
    if (data.service !== undefined) { sets.push('service = ?'); values.push(data.service); }
    if (data.threshold !== undefined) { sets.push('threshold = ?'); values.push(data.threshold); }
    if (data.status !== undefined) { sets.push('status = ?'); values.push(data.status); }

    if (sets.length === 0) return existing;

    values.push(id);
    await this.db.prepare(`UPDATE alerts SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

    return this.getRule(id);
  }

  async deleteRule(id: string): Promise<boolean> {
    await this.db.prepare('DELETE FROM alerts WHERE id = ?').bind(id).run();
    return true;
  }

  async fireAlert(alertId: string, metricValue?: Record<string, unknown>): Promise<AlertEvent> {
    const alert = await this.getRule(alertId);
    if (!alert || alert.status !== 'active') {
      throw new Error('Alert rule not found or inactive');
    }

    const eventId = `ale_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    await this.db.prepare(
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

    await this.db.prepare('UPDATE alerts SET last_fired_at = ? WHERE id = ?').bind(now, alertId).run();

    const audit = new AuditService(this.db);
    if (alert.organization_id) {
      await audit.log({
        organization_id: alert.organization_id,
        actor_id: 'system',
        event_type: 'alert_fired',
        metadata: { alert_id: alertId, rule_name: alert.rule_name, severity: alert.severity },
      });
    }

    return {
      id: eventId,
      alert_id: alertId,
      organization_id: alert.organization_id || undefined,
      triggered_at: now,
      metric_value: metricValue ? JSON.stringify(metricValue) : undefined,
      status: 'firing',
    };
  }

  async resolveAlert(eventId: string): Promise<void> {
    const now = Date.now();
    await this.db.prepare('UPDATE alert_events SET status = ?, resolved_at = ? WHERE id = ?').bind('resolved', now, eventId).run();
  }

  async getAlertEvents(alertId?: string, organizationId?: string, limit: number = 50): Promise<AlertEvent[]> {
    let query = 'SELECT * FROM alert_events WHERE 1=1';
    const params: unknown[] = [];

    if (alertId) {
      query += ' AND alert_id = ?';
      params.push(alertId);
    }

    if (organizationId) {
      query += ' AND organization_id = ?';
      params.push(organizationId);
    }

    query += ' ORDER BY triggered_at DESC LIMIT ?';
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all();
    return (result.results as AlertEventRow[]).map(this.mapEvent);
  }

  async getAlertSummary(organizationId?: string): Promise<AlertSummary> {
    let alertQuery = 'SELECT * FROM alerts';
    const alertParams: unknown[] = [];
    if (organizationId) {
      alertQuery += ' WHERE organization_id = ?';
      alertParams.push(organizationId);
    }
    const alertsResult = await this.db.prepare(alertQuery).bind(...alertParams).all();
    const alerts = alertsResult.results as AlertRuleRow[];

    const activeAlerts = alerts.filter((a) => a.status === 'active').length;
    const firingEvents = await this.getAlertEvents(undefined, organizationId, 100);
    const firingAlerts = firingEvents.filter((e) => e.status === 'firing').length;

    const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && a.status === 'active').length;
    const highAlerts = alerts.filter((a) => a.severity === 'high' && a.status === 'active').length;
    const mediumAlerts = alerts.filter((a) => a.severity === 'medium' && a.status === 'active').length;
    const lowAlerts = alerts.filter((a) => a.severity === 'low' && a.status === 'active').length;

    return {
      total_alerts: alerts.length,
      active_alerts: activeAlerts,
      firing_alerts: firingAlerts,
      critical_alerts: criticalAlerts,
      high_alerts: highAlerts,
      medium_alerts: mediumAlerts,
      low_alerts: lowAlerts,
    };
  }

  async evaluateRules(organizationId?: string): Promise<AlertEvent[]> {
    const rules = await this.listRules(organizationId);
    const firedEvents: AlertEvent[] = [];

    for (const rule of rules) {
      if (rule.status !== 'active') continue;

      const shouldFire = await this.evaluateThreshold(rule);
      if (shouldFire) {
        const event = await this.fireAlert(rule.id, shouldFire);
        firedEvents.push(event);
      }
    }

    return firedEvents;
  }

  private async evaluateThreshold(rule: AlertRule): Promise<Record<string, unknown> | null> {
    const threshold = JSON.parse(rule.threshold) as { metric: string; operator: string; value: number; window_minutes?: number; service?: string };
    const windowMinutes = threshold.window_minutes || 5;
    const windowStart = Date.now() - windowMinutes * 60 * 1000;

    if (threshold.metric === 'error_rate' && rule.service) {
      const metricsService = new MetricsService(this.db);
      const signals = await metricsService.getGoldenSignals(rule.service, windowMinutes);
      if (signals.error_rate > threshold.value) {
        return { metric: 'error_rate', value: signals.error_rate, threshold: threshold.value, service: rule.service };
      }
    }

    if (threshold.metric === 'cross_org_denial_count') {
      const countResult = await this.db.prepare(
        'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND created_at >= ?'
      ).bind('cross_org_access_denied', windowStart).first();
      const count = (countResult as { count: number }).count || 0;
      if (count > threshold.value) {
        return { metric: 'cross_org_denial_count', value: count, threshold: threshold.value };
      }
    }

    if (threshold.metric === 'failed_login_rate' && rule.service === 'identity') {
      const countResult = await this.db.prepare(
        'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
      ).bind('identity', 'login', 'error', windowStart).first();
      const count = (countResult as { count: number }).count || 0;
      const rate = count / windowMinutes;
      if (rate > threshold.value) {
        return { metric: 'failed_login_rate', value: rate, threshold: threshold.value, window_minutes: windowMinutes };
      }
    }

    if (threshold.metric === 'sso_error_rate' && rule.service === 'identity') {
      const countResult = await this.db.prepare(
        'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
      ).bind('identity', 'sso_callback', 'error', windowStart).first();
      const count = (countResult as { count: number }).count || 0;
      if (count > threshold.value) {
        return { metric: 'sso_error_rate', value: count, threshold: threshold.value };
      }
    }

    if (threshold.metric === 'd1_error_rate') {
      const metricsService = new MetricsService(this.db);
      const d1Metrics = await metricsService.getD1Metrics();
      if (d1Metrics.error_rate > threshold.value) {
        return { metric: 'd1_error_rate', value: d1Metrics.error_rate, threshold: threshold.value };
      }
    }

    if (threshold.metric === 'queue_depth') {
      const metricsService = new MetricsService(this.db);
      const queueMetrics = await metricsService.getQueueMetrics(rule.service || 'offline-delivery');
      if (queueMetrics.depth > threshold.value) {
        return { metric: 'queue_depth', value: queueMetrics.depth, threshold: threshold.value, queue: rule.service };
      }
    }

    return null;
  }

  private mapRule(row: AlertRuleRow): AlertRule {
    return {
      id: row.id,
      organization_id: row.organization_id || undefined,
      rule_name: row.rule_name,
      severity: row.severity as AlertRule['severity'],
      service: row.service || undefined,
      threshold: row.threshold,
      status: row.status as AlertRule['status'],
      last_fired_at: row.last_fired_at || undefined,
      created_at: row.created_at,
    };
  }

  private mapEvent(row: AlertEventRow): AlertEvent {
    return {
      id: row.id,
      alert_id: row.alert_id,
      organization_id: row.organization_id || undefined,
      triggered_at: row.triggered_at,
      resolved_at: row.resolved_at || undefined,
      metric_value: row.metric_value || undefined,
      status: row.status as AlertEvent['status'],
      metadata: row.metadata || undefined,
    };
  }
}
