export interface AlertRule {
  id: string;
  organization_id?: string;
  rule_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  service?: string;
  threshold: string;
  status: 'active' | 'suppressed' | 'resolved';
  last_fired_at?: number;
  created_at: number;
}

export interface AlertEvent {
  id: string;
  alert_id: string;
  organization_id?: string;
  triggered_at: number;
  resolved_at?: number;
  metric_value?: string;
  status: 'firing' | 'resolved' | 'suppressed';
  metadata?: string;
}

export interface AlertSummary {
  total_alerts: number;
  active_alerts: number;
  firing_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
}
