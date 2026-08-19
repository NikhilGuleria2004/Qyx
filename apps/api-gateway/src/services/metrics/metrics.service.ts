import { D1Database } from '@cloudflare/workers-types';
import { MetricEvent, GoldenSignals, SecurityMetrics } from './metrics.types';

export class MetricsService {
  constructor(private db: D1Database) {}

  async recordEvent(event: Omit<MetricEvent, 'id' | 'created_at'>): Promise<void> {
    const id = `met_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();

    await this.db.prepare(
      `INSERT INTO metrics_events (id, service, operation, organization_id, user_id, status, latency_ms, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      event.service,
      event.operation,
      event.organization_id || null,
      event.user_id || null,
      event.status,
      event.latency_ms,
      event.metadata ? JSON.stringify(event.metadata) : null,
      now
    ).run();
  }

  async getGoldenSignals(service: string, windowMinutes: number = 5): Promise<GoldenSignals> {
    const windowStart = Date.now() - windowMinutes * 60 * 1000;
    const windowEnd = Date.now();

    const countResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND created_at >= ? AND created_at <= ?'
    ).bind(service, windowStart, windowEnd).first();
    const total = (countResult as { count: number }).count || 0;

    const errorResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND status = ? AND created_at >= ? AND created_at <= ?'
    ).bind(service, 'error', windowStart, windowEnd).first();
    const errors = (errorResult as { count: number }).count || 0;

    const latencyResult = await this.db.prepare(
      'SELECT latency_ms FROM metrics_events WHERE service = ? AND created_at >= ? AND created_at <= ? ORDER BY latency_ms ASC'
    ).bind(service, windowStart, windowEnd).all();
    const latencies = (latencyResult.results as Array<{ latency_ms: number }>).map((r) => r.latency_ms);

    const requestRate = windowMinutes > 0 ? total / windowMinutes : 0;
    const errorRate = total > 0 ? errors / total : 0;

    let latencyP50 = 0;
    let latencyP95 = 0;
    let latencyP99 = 0;

    if (latencies.length > 0) {
      latencyP50 = this.percentile(latencies, 50);
      latencyP95 = this.percentile(latencies, 95);
      latencyP99 = this.percentile(latencies, 99);
    }

    return {
      service,
      request_rate: Math.round(requestRate * 100) / 100,
      error_rate: Math.round(errorRate * 10000) / 100,
      latency_p50: latencyP50,
      latency_p95: latencyP95,
      latency_p99: latencyP99,
      window_start: windowStart,
      window_end: windowEnd,
    };
  }

  async getAllGoldenSignals(windowMinutes: number = 5): Promise<GoldenSignals[]> {
    const services = ['api-gateway', 'messaging', 'group', 'channel', 'file', 'identity', 'organization'];
    const signals: GoldenSignals[] = [];

    for (const service of services) {
      const signal = await this.getGoldenSignals(service, windowMinutes);
      signals.push(signal);
    }

    return signals;
  }

  async getSecurityMetrics(orgId: string): Promise<SecurityMetrics> {
    const windowStart = Date.now() - 60 * 60 * 1000;

    const totalUsersResult = await this.db.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ?').bind(orgId).first();
    const totalUsers = (totalUsersResult as { count: number }).count || 0;

    const mfaEnabledResult = await this.db.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND mfa_enabled = 1').bind(orgId).first();
    const mfaEnabled = (mfaEnabledResult as { count: number }).count || 0;
    const mfaAdoptionPct = totalUsers > 0 ? Math.round((mfaEnabled / totalUsers) * 100) : 0;

    const totalDevicesResult = await this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ?').bind(orgId).first();
    const totalDevices = (totalDevicesResult as { count: number }).count || 0;
    const activeDevicesResult = await this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ? AND status = ?').bind(orgId, 'active').first();
    const activeDevices = (activeDevicesResult as { count: number }).count || 0;
    const deviceVerificationPct = totalDevices > 0 ? Math.round((activeDevices / totalDevices) * 100) : 0;

    const suspendedResult = await this.db.prepare('SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND status = ?').bind(orgId, 'suspended').first();
    const suspendedAccounts = (suspendedResult as { count: number }).count || 0;

    const activeSessionsResult = await this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE organization_id = ? AND expires_at > ?').bind(orgId, Date.now()).first();
    const activeSessions = (activeSessionsResult as { count: number }).count || 0;

    const unrecognizedDevicesResult = await this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE organization_id = ? AND status = ?').bind(orgId, 'pending').first();
    const unrecognizedDevices = (unrecognizedDevicesResult as { count: number }).count || 0;

    const failedLoginsResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
    ).bind('identity', 'login', 'error', windowStart).first();
    const failedLogins = (failedLoginsResult as { count: number }).count || 0;
    const failedLoginRate = Math.round((failedLogins / 60) * 100) / 100;

    const crossOrgDenialsResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND created_at >= ?'
    ).bind('api-gateway', 'cross_org_access_denied', windowStart).first();
    const crossOrgAccessDenialCount = (crossOrgDenialsResult as { count: number }).count || 0;

    const ssoErrorsResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE service = ? AND operation = ? AND status = ? AND created_at >= ?'
    ).bind('identity', 'sso_callback', 'error', windowStart).first();
    const ssoErrorCount = (ssoErrorsResult as { count: number }).count || 0;

    return {
      mfa_adoption_percentage: mfaAdoptionPct,
      device_verification_percentage: deviceVerificationPct,
      active_sessions: activeSessions,
      suspended_accounts: suspendedAccounts,
      unrecognized_devices: unrecognizedDevices,
      failed_login_rate: failedLoginRate,
      cross_org_access_denial_count: crossOrgAccessDenialCount,
      sso_error_count: ssoErrorCount,
    };
  }

  async getDoMetrics(doName: string): Promise<{
    active_connections: number;
    fan_out_latency_ms: number;
    cpu_time_ms: number;
  }> {
    const doResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('do_connection', `%"do_name":"${doName}"%`, Date.now() - 5 * 60 * 1000).first();
    const activeConnections = (doResult as { count: number }).count || 0;

    const latencyResult = await this.db.prepare(
      'SELECT AVG(latency_ms) as avg_latency FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('do_fan_out', `%"do_name":"${doName}"%`, Date.now() - 5 * 60 * 1000).first();
    const fanOutLatency = (latencyResult as { avg_latency: number }).avg_latency || 0;

    return {
      active_connections: activeConnections,
      fan_out_latency_ms: Math.round(fanOutLatency),
      cpu_time_ms: 0,
    };
  }

  async getQueueMetrics(queueName: string): Promise<{
    depth: number;
    consumer_lag: number;
    retry_count: number;
    dead_letter_count: number;
  }> {
    const depthResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('queue_send', `%"queue_name":"${queueName}"%`, Date.now() - 5 * 60 * 1000).first();
    const depth = (depthResult as { count: number }).count || 0;

    const lagResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('queue_pending', `%"queue_name":"${queueName}"%`, Date.now() - 5 * 60 * 1000).first();
    const consumerLag = (lagResult as { count: number }).count || 0;

    const retryResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('queue_retry', `%"queue_name":"${queueName}"%`, Date.now() - 5 * 60 * 1000).first();
    const retryCount = (retryResult as { count: number }).count || 0;

    const deadLetterResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND metadata LIKE ? AND created_at >= ?'
    ).bind('queue_dead_letter', `%"queue_name":"${queueName}"%`, Date.now() - 5 * 60 * 1000).first();
    const deadLetterCount = (deadLetterResult as { count: number }).count || 0;

    return {
      depth,
      consumer_lag: consumerLag,
      retry_count: retryCount,
      dead_letter_count: deadLetterCount,
    };
  }

  async getD1Metrics(): Promise<{ query_latency_ms: number; error_rate: number }> {
    const windowStart = Date.now() - 5 * 60 * 1000;

    const totalResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND created_at >= ?'
    ).bind('d1_query', windowStart).first();
    const total = (totalResult as { count: number }).count || 0;

    const errorResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND status = ? AND created_at >= ?'
    ).bind('d1_query', 'error', windowStart).first();
    const errors = (errorResult as { count: number }).count || 0;

    const latencyResult = await this.db.prepare(
      'SELECT AVG(latency_ms) as avg_latency FROM metrics_events WHERE operation = ? AND created_at >= ?'
    ).bind('d1_query', windowStart).first();
    const avgLatency = (latencyResult as { avg_latency: number }).avg_latency || 0;

    return {
      query_latency_ms: Math.round(avgLatency),
      error_rate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
    };
  }

  async getR2Metrics(operation: 'upload' | 'download'): Promise<{ success_rate: number; latency_ms: number }> {
    const windowStart = Date.now() - 5 * 60 * 1000;
    const op = operation === 'upload' ? 'b2_upload' : 'b2_download';

    const totalResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND created_at >= ?'
    ).bind(op, windowStart).first();
    const total = (totalResult as { count: number }).count || 0;

    const successResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM metrics_events WHERE operation = ? AND status = ? AND created_at >= ?'
    ).bind(op, 'success', windowStart).first();
    const successes = (successResult as { count: number }).count || 0;

    const latencyResult = await this.db.prepare(
      'SELECT AVG(latency_ms) as avg_latency FROM metrics_events WHERE operation = ? AND created_at >= ?'
    ).bind(op, windowStart).first();
    const avgLatency = (latencyResult as { avg_latency: number }).avg_latency || 0;

    return {
      success_rate: total > 0 ? Math.round((successes / total) * 10000) / 100 : 0,
      latency_ms: Math.round(avgLatency),
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
  }
}
