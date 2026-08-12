# Database Design

## 1. Purpose

Defines how data is structured and stored in Cloudflare D1 (SQLite-compatible, edge-replicated relational database), plus R2 (encrypted blob storage) and KV (cache/session) usage.

## 2. Design Principles

- Every tenant-owned table includes `organization_id`, indexed, and **every query filters on it** — no query pattern exists that skips this filter.
- Message and file content columns store **ciphertext only** (`BLOB`/`TEXT` opaque to the server).
- No hard deletes on `users`; status-driven lifecycle (`active` / `suspended` / `deactivated`).
- Timestamps stored as UTC epoch integers (`INTEGER`, ms) for consistency across SQLite/D1.
- IDs are prefixed ULIDs/UUIDs (`org_...`, `usr_...`, `msg_...`) for readability and collision resistance, generated client- or edge-side (not auto-increment, to support future multi-region write scenarios).

## 3. Entity-Relationship Overview

```
organizations 1───* domains
organizations 1───* users
organizations 1───* conversations
organizations 1───* groups
organizations 1───* channels
organizations 1───* files
organizations 1───* audit_events

users 1───* devices
users 1───* conversation_members (via conversations)
users 1───* group_members (via groups)
users 1───* channel_members (via channels)

conversations 1───* messages
groups 1───* group_members
channels 1───* channel_members
```

## 4. Schema (DDL — Cloudflare D1 / SQLite dialect)

```sql
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
```

## 5. Non-Relational / Auxiliary Stores

| Store | Key pattern | Value | TTL |
|---|---|---|---|
| KV `sessions` | `session:{sessionId}` | serialized session (user_id, org_id, role, device_id) | matches refresh-token lifetime |
| KV `rate_limit` | `rl:{route}:{userId or ip}` | counter | sliding window (e.g., 60s) |
| KV `webauthn_challenge` | `webauthn:{userId}` | one-time challenge | 5 min |
| KV `domain_verification` | `dv:{domain}` | verification token | 24h |
| R2 bucket `attachments` | `{organization_id}/{file_id}` | encrypted blob | policy-defined retention |
| R2 bucket `avatars` (optional) | `{organization_id}/{user_id}` | encrypted or non-sensitive asset | n/a |
| Durable Object storage | per-DO transactional storage | connected socket registry, sequence counters | ephemeral/coordination only |

## 6. Query Scoping Pattern (mandatory convention)

Every service query helper follows this shape — illustrated for messages:

```ts
// db/queries/messages.ts
export async function getMessagesForConversation(
  db: D1Database,
  orgId: string,          // mandatory — no overload without it
  conversationId: string,
  cursor?: number
) {
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE organization_id = ?1 AND conversation_id = ?2
       AND (?3 IS NULL OR created_at < ?3)
       ORDER BY created_at DESC LIMIT 50`
    )
    .bind(orgId, conversationId, cursor ?? null)
    .all();
}
```

This pattern (mandatory `orgId` parameter, always in the `WHERE` clause) is enforced via code review checklist and a lint rule that flags any raw `db.prepare` call outside `db/queries/*`.

## 7. Migration Strategy

- Migrations authored as versioned SQL files (`migrations/0001_init.sql`, etc.), applied via `wrangler d1 migrations apply`.
- Every migration reviewed for: (a) new tables include `organization_id` + index, (b) no plaintext content columns introduced, (c) backward-compatible for zero-downtime deploys where feasible.

## 8. Data Retention & Deletion

- `users.status = 'deactivated'` retains all rows; no cascading deletes.
- Org-configurable retention policy governs eventual anonymization of `display_name`/`email` fields after a configurable period post-deactivation, while preserving `id` referential integrity for audit/history.
- File objects in R2 follow the org's `org_security_policy` retention window; orphaned `pending` file rows/objects garbage-collected via scheduled Queue job after 24h.
