CREATE TABLE device_authorization_requests (
  id TEXT PRIMARY KEY,
  pending_device_id TEXT NOT NULL REFERENCES devices(id),
  authorized_by_device_id TEXT NOT NULL REFERENCES devices(id),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_device_auth_pending ON device_authorization_requests(pending_device_id);
