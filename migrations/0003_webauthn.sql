-- Add passkey support to users table
ALTER TABLE users ADD COLUMN passkey_public_key TEXT;
ALTER TABLE users ADD COLUMN passkey_credential_id TEXT;
ALTER TABLE users ADD COLUMN passkey_sign_count INTEGER DEFAULT 0;

-- WebAuthn credentials table
CREATE TABLE webauthn_credentials (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  credential_id   TEXT NOT NULL,
  public_key      TEXT NOT NULL,
  sign_count      INTEGER NOT NULL DEFAULT 0,
  device_name     TEXT NOT NULL,
  platform        TEXT,
  created_at      INTEGER NOT NULL,
  last_used_at    INTEGER,
  UNIQUE(credential_id)
);
CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_cred_id ON webauthn_credentials(credential_id);

-- WebAuthn challenges table (for tracking single-use challenges)
CREATE TABLE webauthn_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  challenge   TEXT NOT NULL,
  type        TEXT NOT NULL, -- registration | authentication
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
