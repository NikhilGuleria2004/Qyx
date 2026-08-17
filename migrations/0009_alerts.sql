-- alerts table for alert rules and fired alerts
CREATE TABLE alerts (
  id              TEXT PRIMARY KEY,          -- alt_...
  organization_id TEXT REFERENCES organizations(id),
  rule_name       TEXT NOT NULL,             -- elevated_error_rate | cross_org_denial_spike | auth_failure_spike | etc.
  severity        TEXT NOT NULL,             -- low | medium | high | critical
  service         TEXT,                        -- api-gateway | messaging | etc.
  threshold       TEXT NOT NULL,             -- JSON expression
  status          TEXT NOT NULL DEFAULT 'active', -- active | suppressed | resolved
  last_fired_at   INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_alerts_org ON alerts(organization_id);
CREATE INDEX idx_alerts_rule ON alerts(rule_name);

-- alert_events table for individual alert firings
CREATE TABLE alert_events (
  id              TEXT PRIMARY KEY,          -- ale_...
  alert_id        TEXT NOT NULL REFERENCES alerts(id),
  organization_id TEXT REFERENCES organizations(id),
  triggered_at    INTEGER NOT NULL,
  resolved_at     INTEGER,
  metric_value    TEXT,                        -- JSON snapshot of triggering metrics
  status          TEXT NOT NULL DEFAULT 'firing', -- firing | resolved | suppressed
  metadata        TEXT                         -- JSON, non-content only
);
CREATE INDEX idx_alert_events_alert ON alert_events(alert_id);
CREATE INDEX idx_alert_events_org_created ON alert_events(organization_id, triggered_at);
