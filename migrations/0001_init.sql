-- organizations
CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,           -- org_...
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active', -- active | suspended
  security_tier TEXT NOT NULL DEFAULT 'standard', -- standard | high | maximum
  created_at    INTEGER NOT NULL
);

-- domains
CREATE TABLE domains (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  domain          TEXT NOT NULL,
  verified        INTEGER NOT NULL DEFAULT 0,  -- boolean
  verification_token TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE(domain)
);
CREATE INDEX idx_domains_org ON domains(organization_id);

-- users
CREATE TABLE users (
  id              TEXT PRIMARY KEY,          -- usr_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email           TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'employee', -- super_admin | admin | manager | employee | security_admin
  status          TEXT NOT NULL DEFAULT 'active',    -- active | suspended | deactivated
  public_key      TEXT,                       -- identity public key (long-term), base64
  created_at      INTEGER NOT NULL,
  last_active_at  INTEGER,
  UNIQUE(organization_id, email)
);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_org_status ON users(organization_id, status);

-- devices
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,            -- dev_...
  user_id       TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id), -- denormalized for scoped queries
  device_name   TEXT NOT NULL,
  platform      TEXT,                        -- web | ios | android | desktop
  public_key    TEXT NOT NULL,                -- X25519 device public key
  signing_key   TEXT NOT NULL,                -- Ed25519 device public key
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | active | revoked
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);
CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_org ON devices(organization_id);

-- conversations (1:1 and groups share this table; type differentiates)
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,          -- conv_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  type            TEXT NOT NULL,             -- direct | group
  group_id        TEXT REFERENCES groups(id), -- null for direct
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_conversations_org ON conversations(organization_id);

-- conversation_members
CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL DEFAULT 'member', -- member | owner
  joined_at       INTEGER NOT NULL,
  removed_at      INTEGER,                    -- null while active member
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_convmembers_user ON conversation_members(user_id);

-- messages
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,          -- msg_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id       TEXT NOT NULL REFERENCES users(id),
  ciphertext      BLOB NOT NULL,              -- opaque, server cannot read
  message_type    TEXT NOT NULL,              -- text | image | audio | video | file | reaction
  attachment_ref  TEXT REFERENCES files(id),
  reply_to        TEXT REFERENCES messages(id),
  status          TEXT NOT NULL DEFAULT 'sent', -- sent | delivered | read
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_org ON messages(organization_id);

-- groups
CREATE TABLE groups (
  id              TEXT PRIMARY KEY,          -- grp_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  key_epoch       INTEGER NOT NULL DEFAULT 1, -- increments on membership-driven key rotation
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_groups_org ON groups(organization_id);

-- group_members
CREATE TABLE group_members (
  group_id   TEXT NOT NULL REFERENCES groups(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'member', -- member | admin
  status     TEXT NOT NULL DEFAULT 'active',  -- pending | active | removed
  joined_at  INTEGER,
  requested_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_groupmembers_user ON group_members(user_id);
CREATE INDEX idx_groupmembers_status ON group_members(group_id, status);

-- channels
CREATE TABLE channels (
  id              TEXT PRIMARY KEY,          -- chn_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_channels_org ON channels(organization_id);

-- channel_members
CREATE TABLE channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  can_post   INTEGER NOT NULL DEFAULT 0,       -- boolean, role-derived at approval time
  status     TEXT NOT NULL DEFAULT 'active',   -- pending | active | removed
  requested_at INTEGER NOT NULL,
  joined_at  INTEGER,
  PRIMARY KEY (channel_id, user_id)
);

-- files
CREATE TABLE files (
  id                       TEXT PRIMARY KEY,  -- file_...
  organization_id          TEXT NOT NULL REFERENCES organizations(id),
  uploader_id              TEXT NOT NULL REFERENCES users(id),
  encrypted_storage_reference TEXT NOT NULL,  -- R2 object key
  mime_type                TEXT NOT NULL,
  size_bytes                INTEGER NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending', -- pending | available | deleted
  created_at                INTEGER NOT NULL
);
CREATE INDEX idx_files_org ON files(organization_id);

-- audit_events
CREATE TABLE audit_events (
  id              TEXT PRIMARY KEY,          -- aud_...
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_id        TEXT REFERENCES users(id),
  event_type      TEXT NOT NULL,              -- user_added, role_changed, group_created, device_revoked, etc.
  metadata        TEXT,                        -- JSON, non-content only
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_audit_org_created ON audit_events(organization_id, created_at);

-- org_security_policy (1:1 with organizations)
CREATE TABLE org_security_policy (
  organization_id      TEXT PRIMARY KEY REFERENCES organizations(id),
  mfa_required_roles    TEXT NOT NULL DEFAULT 'super_admin,admin', -- CSV of roles
  allowed_file_types    TEXT NOT NULL DEFAULT 'pdf,docx,xlsx,pptx,png,jpg,mp4',
  max_file_size_mb      INTEGER NOT NULL DEFAULT 500,
  external_sharing      INTEGER NOT NULL DEFAULT 0,
  notification_preview  INTEGER NOT NULL DEFAULT 0, -- 0 = generic only
  recovery_policy        TEXT NOT NULL DEFAULT 'device_only' -- device_only | enterprise_key | user_backup
);
