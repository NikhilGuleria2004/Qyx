CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_invites_org ON invites(organization_id);
CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_email ON invites(email);
