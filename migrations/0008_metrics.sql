-- metrics_events table for golden signals and security metrics
CREATE TABLE metrics_events (
  id              TEXT PRIMARY KEY,          -- met_...
  service         TEXT NOT NULL,             -- api-gateway | messaging | group | channel | file | identity | organization
  operation       TEXT NOT NULL,             -- http_request | do_message | queue_send | d1_query | r2_upload | r2_download
  organization_id TEXT REFERENCES organizations(id),
  user_id         TEXT REFERENCES users(id),
  status          TEXT NOT NULL,             -- success | error | timeout
  latency_ms      INTEGER NOT NULL,
  metadata        TEXT,                        -- JSON, non-content only
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_metrics_service_created ON metrics_events(service, created_at);
CREATE INDEX idx_metrics_org_created ON metrics_events(organization_id, created_at);
CREATE INDEX idx_metrics_operation ON metrics_events(operation);
