export interface MetricEvent {
  id: string;
  service: string;
  operation: string;
  organization_id?: string;
  user_id?: string;
  status: 'success' | 'error' | 'timeout';
  latency_ms: number;
  metadata?: Record<string, unknown>;
  created_at: number;
}

export interface GoldenSignals {
  service: string;
  request_rate: number;
  error_rate: number;
  latency_p50: number;
  latency_p95: number;
  latency_p99: number;
  window_start: number;
  window_end: number;
}

export interface DoMetrics {
  do_name: string;
  active_connections: number;
  fan_out_latency_ms: number;
  cpu_time_ms: number;
}

export interface QueueMetrics {
  queue_name: string;
  depth: number;
  consumer_lag: number;
  retry_count: number;
  dead_letter_count: number;
}

export interface D1Metrics {
  query_latency_ms: number;
  error_rate: number;
}

export interface R2Metrics {
  operation: 'upload' | 'download';
  success_rate: number;
  latency_ms: number;
}

export interface SecurityMetrics {
  mfa_adoption_percentage: number;
  device_verification_percentage: number;
  active_sessions: number;
  suspended_accounts: number;
  unrecognized_devices: number;
  failed_login_rate: number;
  cross_org_access_denial_count: number;
  sso_error_count: number;
}
