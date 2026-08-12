# Low-Level Design / Technical Design Specification (LLD/TDS)

## 1. Purpose

Describes exactly how each component from the HLD works internally: module structure, algorithms, request flows, state machines, and edge-case handling.

---

## 2. Backend Module Structure (Hono on Workers)

```
src/
├── index.ts                # Hono app entry, route mounting
├── middleware/
│   ├── auth.ts              # Session/JWT verification, attaches ctx.user
│   ├── orgScope.ts          # Enforces organization_id match (FR-ORG-05)
│   ├── rbac.ts               # Role/permission checks
│   ├── rateLimit.ts          # KV-backed rate limiting
│   └── validate.ts           # Zod schema validation wrapper
├── services/
│   ├── identity/             # register, login, mfa, passkeys, sso, devices
│   ├── organization/         # org CRUD, domain verification
│   ├── messaging/             # conversations, messages
│   ├── group/                 # groups, membership
│   ├── channel/                # channels, broadcast
│   ├── file/                    # upload/download coordination
│   └── audit/                    # audit event writer + security metrics
├── durable-objects/
│   ├── ConversationDO.ts     # realtime fan-out for 1:1 + groups
│   └── ChannelDO.ts           # realtime fan-out for broadcast channels
├── db/
│   ├── schema.ts               # D1 schema (Drizzle or Kysely typed layer)
│   └── queries/                 # scoped query builders (always org-scoped)
├── lib/
│   ├── crypto/                   # Web Crypto wrappers (server-side: signature/verification only)
│   └── zodSchemas/
└── types/
```

---

## 3. Key Component Designs

### 3.1 `orgScope` Middleware

**Algorithm:**
1. Extract `organization_id` from verified session (never trust client body/header).
2. For any route with a resource ID (e.g., `/conversations/:id`), the resolving DB query MUST include `AND organization_id = ctx.session.organization_id`.
3. If a lookup by primary key alone returns a row whose `organization_id` differs from session, return `403 Forbidden` and emit an `audit_events` row of type `cross_org_access_denied`.
4. All service-layer query helpers accept `orgId` as a mandatory first parameter — there is no query helper variant that omits it, preventing accidental unscoped queries.

### 3.2 Authentication Flow (`identity` service)

**Login state machine:**
```
UNAUTHENTICATED
   → credentials_submitted (password or SSO assertion)
   → PRIMARY_VERIFIED
   → mfa_challenge_issued (if MFA required by org policy or role)
   → MFA_VERIFIED
   → device_check (known device? new device?)
        ├─ known & trusted → SESSION_ISSUED
        └─ new → device_registration_flow → pending_authorization
                 (existing device approval OR recovery policy) → SESSION_ISSUED
```
- Session tokens: short-lived JWT (access, ~15 min) + rotating refresh token (stored httpOnly, KV-tracked for revocation).
- MFA: TOTP (RFC 6238) via Web Crypto-compatible library; passkeys via WebAuthn ceremony (challenge stored in KV, single-use).
- SSO: OIDC authorization-code flow for Entra ID/Google Workspace/Okta; SAML as fallback for legacy IdPs. Assertion mapped to org via verified domain claim.

### 3.3 Device Registration & Key Provisioning

1. Client generates a device key pair (X25519 for key agreement, Ed25519 for signing) locally via Web Crypto; private keys never leave the device (browser: non-extractable `CryptoKey` where possible; future native: OS keystore).
2. Public keys + device metadata (name, platform) sent to Identity Service → stored in `devices` table, status `pending` until authorized.
3. **New-device authorization:**
   - Existing trusted device displays a pairing code/QR; new device submits it.
   - Existing device's client signs an authorization payload containing the new device's public key, encrypts the user's key-encryption-key material to the new device's public key, and relays it via the server (server only moves ciphertext).
   - On success, `devices.status = active`.
4. If no other trusted device exists (first login), enterprise/recovery policy governs (see LLD §3.7).

### 3.4 Messaging Send Path

```
Client
  1. Fetch recipient/group current key material (public keys / group key epoch) from Messaging Service.
  2. Encrypt message locally (session established via double-ratchet-style protocol for 1:1;
     sender-key or similar for groups).
  3. POST /messages { conversation_id, ciphertext, message_type, attachment_ref? }

Messaging Worker
  4. authMiddleware + orgScope: verify sender is a member of conversation_id within their org.
  5. Persist row to D1 `messages` (ciphertext opaque blob).
  6. Notify ConversationDO(conversation_id) via DO stub RPC: { event: "new_message", messageId }.

ConversationDO
  7. If recipient(s) have active WebSocket connections registered on this DO instance → push ciphertext frame immediately.
  8. Else → enqueue { conversation_id, message_id, recipient_id } to Cloudflare Queue "offline-delivery".

Notification Worker (Queue consumer)
  9. Look up recipient's push subscription; send generic notification ("New message from <sender name>") — no plaintext, no ciphertext, per NFR-01/FR-MSG-07.
```

**Durable Object sharding:** one `ConversationDO` per `conversation_id` (1:1 or group) — guarantees strict ordering per conversation without cross-conversation contention. `ChannelDO` follows the same pattern for broadcast channels, but with a read-heavy fan-out optimized path (no per-recipient ack tracking required for large subscriber counts beyond aggregate delivery stats).

### 3.5 Group Membership & Key Rotation

**On member added:**
1. Admin approves request → Group Service marks membership `active`.
2. Server signals all *existing* group members' active devices (via their ConversationDO/notification channel) that a key-provisioning event occurred.
3. An existing authorized device (or a designated "key admin" device per protocol design) encrypts the current/next group key epoch to the new member's device public key and relays it through the server.
4. New member's client decrypts locally and can now decrypt subsequent group messages. **Historical messages remain inaccessible unless explicitly granted** (policy-configurable: no history access by default).

**On member removed:**
1. Admin removes member → Group Service marks membership `removed`, revokes their device access tokens for that conversation's DO.
2. Remaining members' clients perform a key rotation (new epoch) via the same relay mechanism, excluding the removed member's device public keys.
3. Server enforces removal at the transport layer too (DO refuses to admit the removed user's device to the WebSocket room), as defense-in-depth — the cryptographic revocation is the real guarantee, the transport block is a redundant control.

### 3.6 File Upload/Download

```
Client:
  1. Generate random file key (AES-256-GCM), encrypt file locally in chunks (streaming, to support large files up to policy max).
  2. Encrypt the file key itself to the recipient(s)/group the same way message keys are handled.
  3. Request pre-signed R2 upload URL from File Service, sending only metadata (mime type declared, size, org_id).

File Service:
  4. Validate mime type/size against org file policy (FR-FILE-02/04). Reject before issuing URL if policy violated.
  5. Issue short-lived R2 pre-signed PUT URL; record `files` row with status `pending`.

Client:
  6. PUT encrypted blob directly to R2.
  7. Notify File Service of completion → status `available`; reference attached to the message as `attachment_ref`.

Download:
  8. Recipient client requests pre-signed GET URL (org/membership-scoped check) → downloads ciphertext → decrypts locally using the file key it received via the message.
```

### 3.7 Account/Key Recovery

Configurable per org security policy (see Security Design doc §Recovery):
- **Existing-device approval** (default, highest security): only another trusted device can authorize a new one.
- **Enterprise recovery key**: org-held recovery key (e.g., HSM/KMS-backed on the org's side) can re-wrap a user's key material — used sparingly, fully audited.
- **User recovery**: encrypted backup of key material protected by a strong recovery credential the user manages.
- Password reset (auth credential) is decoupled from key recovery — resetting a password alone never yields plaintext key material server-side.

### 3.8 Local Search Index

- On each successful message decrypt, client upserts a searchable record (message id, decrypted text, timestamp) into an IndexedDB-backed local index.
- Index is per-device, never synced in plaintext; on new device, index rebuilds locally as history is fetched and decrypted.

---

## 4. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Cross-org resource access attempt | 403 + audit event, no data leaked in error message |
| Message send to removed group member's stale session | DO validates membership at send-time, not just connect-time |
| Duplicate device registration (same device re-registering) | Match by device public key fingerprint; update rather than duplicate |
| Queue delivery failure (push provider down) | Exponential backoff via Cloudflare Queues retry; ciphertext remains durably in D1 regardless, so no message loss |
| Partial file upload failure | `files.status` remains `pending`; garbage-collection job (Queue-scheduled) purges orphaned R2 objects after TTL |
| Domain verification token expiry | Org creation flow blocks org activation until a fresh TXT record check succeeds; token re-issuable |

## 5. Sequence Diagram — Group Message with One Offline Member

```
Alice(client)      Messaging Worker     ConversationDO(groupId)     Queue        Notification Worker     Bob(offline)
   |  encrypt+POST      |                        |                    |                  |                    |
   |-------------------->|                        |                    |                  |                    |
   |                     | orgScope+membership OK |                    |                  |                    |
   |                     |--persist D1----------->|                    |                  |                    |
   |                     |--notify(new_message)-->|                    |                  |                    |
   |                     |                        |--push(Charlie)-->  |                  |                    |
   |                     |                        |--enqueue(Bob)----->|                  |                    |
   |                     |                        |                    |--consume-------->|                    |
   |                     |                        |                    |                  |--generic push----->|
```
