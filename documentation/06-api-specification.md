# API Specification

## 1. Purpose

Defines how frontend, native clients, and internal services communicate with the backend: REST conventions, authentication, endpoint catalog, request/response schemas (Zod-validated), realtime WebSocket protocol, and error format.

## 2. Conventions

- **Style:** REST over HTTPS, JSON bodies, resource-oriented URLs.
- **Base URL:** `https://api.<product-domain>/v1`
- **Auth:** `Authorization: Bearer <access_token>` (JWT, 15 min expiry) on every authenticated route.
- **Validation:** All request bodies/query params validated with Zod schemas shared between client and server (monorepo `packages/schemas`).
- **Org scoping:** `organization_id` is **never** accepted as a client-supplied field for authorization purposes — it is always derived server-side from the authenticated session. Any `organization_id` present in a request body is ignored/rejected if it conflicts with the session.
- **Pagination:** Cursor-based (`?cursor=<opaque>&limit=<n>`), response includes `next_cursor`.
- **Idempotency:** Mutating endpoints that create resources accept an optional `Idempotency-Key` header.
- **Versioning:** URL-path versioned (`/v1`); breaking changes require `/v2`.

## 3. Standard Error Format

```json
{
  "error": {
    "code": "ORG_SCOPE_VIOLATION",
    "message": "Resource not found or not accessible.",
    "request_id": "req_01hz..."
  }
}
```

Common error codes: `UNAUTHENTICATED`, `MFA_REQUIRED`, `ORG_SCOPE_VIOLATION`, `FORBIDDEN_ROLE`, `VALIDATION_ERROR`, `RATE_LIMITED`, `FILE_POLICY_VIOLATION`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.

Note: `ORG_SCOPE_VIOLATION` intentionally returns the same shape as `NOT_FOUND` in production responses (404-style body, code differs only for internal logging) to avoid confirming the existence of another org's resource.

## 4. Authentication & Identity Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register with org email (subject to domain allow-list) |
| POST | `/auth/login` | Password login, step 1 (returns MFA challenge if required) |
| POST | `/auth/mfa/verify` | Verify TOTP/passkey challenge, returns session |
| POST | `/auth/sso/:provider/start` | Begin OIDC/SAML flow |
| GET | `/auth/sso/:provider/callback` | IdP redirect target |
| POST | `/auth/refresh` | Exchange refresh token for new access token |
| POST | `/auth/logout` | Revoke current session |
| GET | `/me` | Current user profile + role + org |
| POST | `/me/devices` | Register a new device (public keys) |
| GET | `/me/devices` | List own devices |
| DELETE | `/me/devices/:deviceId` | Revoke own device |
| POST | `/me/devices/:deviceId/authorize` | Approve a pending device (from an existing trusted device) |

**Example — `POST /auth/mfa/verify`**

Request:
```json
{ "challenge_id": "chal_9f...", "totp_code": "482913" }
```
Response `200`:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": { "id": "usr_72a91f", "organization_id": "org_44b1", "role": "employee" }
}
```

## 5. Organization & Admin Endpoints

| Method | Path | Role required | Description |
|---|---|---|---|
| POST | `/organizations` | (unauthenticated → becomes Super Admin) | Create organization |
| POST | `/organizations/:orgId/domains` | super_admin | Add domain, returns TXT verification token |
| POST | `/organizations/:orgId/domains/:domainId/verify` | super_admin | Trigger DNS verification check |
| GET | `/organizations/:orgId/settings` | admin+ | Get org/security/file policy |
| PATCH | `/organizations/:orgId/settings` | admin+ | Update policy |
| GET | `/organizations/:orgId/members` | admin+ | List members (paginated, filterable by status) |
| POST | `/organizations/:orgId/members` | admin+ | Invite/add member |
| PATCH | `/organizations/:orgId/members/:userId` | admin+ | Update role/status (suspend/deactivate) |
| GET | `/organizations/:orgId/audit` | admin+ | List audit events |
| GET | `/organizations/:orgId/security-summary` | admin+ | MFA %, device verification %, active sessions, etc. |

## 6. Messaging Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/conversations` | Create/get a direct conversation with another user (same org) |
| GET | `/conversations` | List current user's conversations |
| GET | `/conversations/:id/messages` | Paginated ciphertext message history |
| POST | `/conversations/:id/messages` | Send a message (ciphertext + metadata) |
| PATCH | `/conversations/:id/messages/:msgId` | Update status (delivered/read) or add reaction |
| GET | `/conversations/:id/keys` | Fetch recipient/group current public key material for encryption |

**Example — `POST /conversations/:id/messages`**

Request:
```json
{
  "message_type": "text",
  "ciphertext": "base64...",
  "reply_to": null,
  "attachment_ref": null
}
```
Response `201`:
```json
{
  "id": "msg_8f2a",
  "conversation_id": "conv_11c9",
  "sender_id": "usr_72a91f",
  "status": "sent",
  "created_at": 1765500000000
}
```

## 7. Groups & Channels Endpoints

| Method | Path | Role required | Description |
|---|---|---|---|
| POST | `/groups` | admin/manager | Create group |
| DELETE | `/groups/:id` | admin | Delete group |
| POST | `/groups/:id/requests` | employee | Request to join |
| GET | `/groups/:id/requests` | admin | List pending requests |
| POST | `/groups/:id/requests/:reqId/approve` | admin | Approve → triggers key provisioning |
| POST | `/groups/:id/requests/:reqId/reject` | admin | Reject |
| DELETE | `/groups/:id/members/:userId` | admin | Remove member → triggers key rotation |
| POST | `/channels` | admin | Create broadcast channel |
| POST | `/channels/:id/posts` | authorized roles only | Post to channel |
| POST | `/channels/:id/requests` | employee | Request to subscribe |
| POST | `/channels/:id/posts/:postId/ack` | employee | Acknowledge/react |

## 8. File Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/files/upload-url` | Request pre-signed R2 upload URL (validates policy on declared metadata) |
| POST | `/files/:id/complete` | Mark upload complete |
| GET | `/files/:id/download-url` | Request pre-signed R2 download URL (membership-scoped) |

**Example — `POST /files/upload-url`**

Request:
```json
{ "mime_type": "application/pdf", "size_bytes": 2048310, "conversation_id": "conv_11c9" }
```
Response `200`:
```json
{ "file_id": "file_a91c", "upload_url": "https://r2.../put?sig=...", "expires_in": 300 }
```
Error `422` (policy violation):
```json
{ "error": { "code": "FILE_POLICY_VIOLATION", "message": "File type not permitted by organization policy." } }
```

## 9. Realtime WebSocket Protocol

**Connect:** `wss://api.<product-domain>/v1/realtime?access_token=...`

Server routes the connection to the appropriate `ConversationDO`/`ChannelDO` instances for all conversations/groups/channels the user is currently a member of (subscription list refreshed on membership change).

**Client → Server frames:**
```json
{ "type": "subscribe", "conversation_ids": ["conv_11c9", "grp_55aa"] }
{ "type": "ack", "message_id": "msg_8f2a" }
{ "type": "typing", "conversation_id": "conv_11c9" }
```

**Server → Client frames:**
```json
{ "type": "message", "conversation_id": "conv_11c9", "message": { "...": "ciphertext + metadata" } }
{ "type": "presence", "user_id": "usr_...", "status": "online" }
{ "type": "membership_changed", "group_id": "grp_55aa", "event": "key_rotation_required" }
{ "type": "revoked", "reason": "removed_from_conversation", "conversation_id": "grp_55aa" }
```

## 10. Rate Limits (defaults, org-tunable)

| Endpoint class | Limit |
|---|---|
| Auth (`/auth/*`) | 10 req / min / IP |
| Message send | 60 req / min / user |
| File upload URL issuance | 20 req / min / user |
| Admin write endpoints | 30 req / min / user |

## 11. OpenAPI

The canonical machine-readable contract is maintained as `openapi.yaml` in the repo (generated/kept in sync with Zod schemas via `zod-to-openapi`), covering every endpoint above with full request/response JSON Schemas, used to generate the TypeScript client SDK consumed by the frontend.
