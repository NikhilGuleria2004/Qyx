# Qyx Implementation Todo

> Master checklist for M1–M9. Check items off as they are completed.
> Source of truth: `Implementation.md`

---

## M1 — Foundation

### P0 — Repo & Cloudflare init
- [x] `apps/web` (React SPA) scaffolded
- [x] `apps/api-gateway` (Hono on Workers) scaffolded
- [x] `workers/notification-worker` scaffolded
- [x] `workers/audit-worker` scaffolded
- [x] `packages/schemas`, `packages/crypto`, `packages/ui`, `packages/config` created
- [x] pnpm workspace configured
- [x] TypeScript, ESLint, Prettier, Tailwind configured
- [x] `wrangler.toml` per environment (dev/staging/prod) with D1/R2/KV/DO/Queue bindings declared
- [x] `pnpm install && pnpm dev && pnpm build && pnpm test && pnpm lint && pnpm typecheck` all exit 0
- [x] `wrangler deploy --dry-run` succeeds for every environment

### P1 — D1 schema & migrations
- [x] `migrations/0001_init.sql` implements full DDL from `05-database-design.md` §4
- [x] Migration runner wired to `wrangler d1 migrations apply`
- [x] Fresh D1 instance migrates cleanly
- [x] Every tenant-owned table has `organization_id` + index (verified against Database Design §6/§7)

### P2 — Shared contracts
- [x] `packages/schemas` created (Zod types/constants)
- [x] `packages/crypto` scaffolding created (empty wrappers with signatures defined, no logic yet)
- [x] Both `apps/web` and `apps/api-gateway` import from `packages/*` without circular deps

### P3 — Design system
- [x] Design tokens wired into Tailwind config (per Implementation.md §5 / Frontend Spec §3.1)
- [x] JetBrains Mono self-hosted variable font loaded
- [x] Re-skinned shadcn primitives: Dialog, Popover, Command, Dropdown, Button, Input, Badge, Toast
- [x] No component hardcodes a hex color outside the token file
- [x] Nothing visually recognizable as "default shadcn"

### P4 — App shell
- [x] Three-pane shell (Directory / Buffer / Inspector) rendered
- [x] Status Bar (28px, always visible) implemented
- [x] Command Palette (`⌘K`) skeleton implemented
- [x] Shell renders with placeholder content at desktop/tablet/mobile widths
- [x] Keyboard-only navigation works end to end

---

## M2 — Identity & Organization

### P5 — Organizations & domain verification
- [x] `organizations` and `domains` tables/routes created
- [x] DNS TXT-record challenge/response verification flow implemented
- [x] `POST /organizations` creates org (creator becomes Super Admin)
- [x] Domain unverified until TXT check passes (ADR-008)
- [x] Org creation blocked without verified domain

### P6 — Users & RBAC roles
- [x] `users` table created
- [x] Role enum implemented (`super_admin`, `admin`, `employee` in v1; `manager`, `security_admin` feature-flagged)
- [x] `rbac.ts` middleware implemented
- [x] Only Super Admin can create orgs
- [x] Only Admin+ can add/suspend users within their own org
- [x] Least-privilege default deny (FR-RBAC-01–05)

### P7 — Authentication
- [x] `/auth/register` route implemented
- [x] `/auth/login` route implemented (password, step 1 — returns MFA challenge if required)
- [x] `/auth/mfa/verify` route implemented
- [x] `/auth/refresh` route implemented
- [x] `/auth/logout` route implemented
- [x] `/me` route implemented
- [x] Password hashing implemented
- [x] TOTP (RFC 6238) implemented
- [x] Login rate limiting via KV implemented
- [x] Login state machine matches LLD §3.2 exactly
- [x] MFA mandatory and enforced for Super Admin/Admin (FR-AUTH-04)

### P8 — Passkeys / WebAuthn
- [x] WebAuthn registration ceremony implemented
- [x] WebAuthn authentication ceremony implemented
- [x] Single-use challenge stored in KV (`webauthn:{userId}`, 5 min TTL)
- [x] Passkey login succeeds
- [x] Replayed/expired challenge rejected

### P9 — `orgScope` middleware
- [x] `middleware/orgScope.ts` implemented per LLD §3.1
- [x] Cross-org resource fetch by guessed valid ID → `403` / `ORG_SCOPE_VIOLATION`
- [x] Violation is audited
- [x] Response body indistinguishable from `404`

### P10 — Audit infrastructure
- [x] `audit_events` table created
- [x] `audit.log()` service helper created and wired into request lifecycle
- [x] No update/delete API surface for audit events
- [x] Login, logout, and every M2 write produce an audit record
- [x] `metadata` never contains content or key material (grep check in CI)

**M2 Gate:** All cross-org isolation test scenarios from Testing Strategy §4/§5 touching Identity/Organization pass before proceeding to M3.

---

## M3 — Device Identity & Client-Side Cryptography

### P11 — `packages/crypto` core
- [x] Key generation wrappers (X25519 / Ed25519, non-extractable where possible)
- [x] AEAD encrypt/decrypt (AES-256-GCM / ChaCha20-Poly1305)
- [x] HKDF derivation wrapper
- [x] CSPRNG usage only (`crypto.getRandomValues`)
- [x] Known-answer cryptographic test vectors pass
- [x] Tampered ciphertext fails AEAD authentication (rejects, never silently corrupts)

### P12 — Device registration
- [x] `devices` table created
- [x] `POST /me/devices` implemented
- [x] `GET /me/devices` implemented
- [x] `DELETE /me/devices/:deviceId` implemented
- [x] Client generates device key pair locally, sends public keys only
- [x] Private keys never leave the device (verified: network tab shows no private key material)
- [x] Device row created with `status=pending`

### P13 — Device authorization flow
- [x] `POST /me/devices/:deviceId/authorize` implemented
- [x] QR / pairing-code UI implemented
- [x] Existing trusted device relays encrypted key material to new device via server
- [x] Server relay never decrypts the payload (ciphertext only)
- [x] New-device flow matches LLD §3.3

### P14 — Identity verification UI
- [x] QR code / security-number / fingerprint comparison screen implemented
- [x] Two clients can confirm a matching fingerprint
- [x] Mismatched fingerprint is visibly flagged

### P15 — Account/key recovery scaffolding
- [x] `org_security_policy.recovery_policy` field created (`device_only` default)
- [x] Recovery-policy selection in org settings implemented
- [x] Device-only path fully implemented
- [x] Enterprise-key and user-backup stubbed behind feature flags
- [x] Password reset never returns/derives key material (ADR-010 regression test)
- [x] Device-only recovery works end to end

**M3 Gate:** Crypto round-trip test suite is green and independently re-reviewed by a second contributor per code-owner requirement before proceeding to M4.

---

## M4 — Messaging Core

### P16 — Conversations (1:1)
- [x] `conversations` and `conversation_members` tables/routes created
- [x] `POST /conversations` implemented
- [x] `GET /conversations` implemented
- [x] Conversation creation is org- and membership-scoped
- [x] Cross-org attempt fails per P9's contract

### P17 — `ConversationDO`
- [x] Durable Object per `conversation_id` created
- [x] Connected-socket registry implemented
- [x] Message sequencing implemented
- [x] Fan-out implemented
- [x] One DO per conversation verified
- [x] Strict per-conversation ordering verified under concurrent sends

### P18 — Message send/receive path
- [x] `GET /conversations/:id/messages` implemented
- [x] `POST /conversations/:id/messages` implemented
- [x] `GET /conversations/:id/keys` implemented
- [x] Full path matches LLD §3.4
- [x] End-to-end verified: client encrypts → D1 persists ciphertext → DO pushes to online recipient's WebSocket
- [x] Matches sequence diagram in LLD §5

### P19 — Offline delivery
- [x] `offline-delivery` Queue created
- [x] `notification-worker` consumer implemented
- [x] Generic (content-free) push payload implemented
- [x] Offline recipient receives ciphertext on reconnect
- [x] Push notification contains no plaintext or ciphertext (FR-MSG-07, ADR-009)

### P20 — Realtime WebSocket protocol
- [x] `wss://.../v1/realtime` endpoint implemented per API Spec §9
- [x] subscribe frame handled
- [x] ack frame handled
- [x] typing frame handled
- [x] presence frame handled
- [x] Client frames and server frames match the spec exactly
- [x] Reconnect resubscribes to current membership list

### P21 — Message buffer UI ("the log")
- [x] Log-line message rendering (not bubbles) implemented
- [x] Consecutive-message collapsing implemented
- [x] Handshake Sequence implemented
- [x] Typing indicator implemented
- [x] Reactions rendered as inline tokens
- [x] No per-message encryption badge exists anywhere (explicit anti-pattern in Frontend Spec §9)

### P22 — Local search index
- [x] IndexedDB-backed decrypted index built client-side on message decrypt
- [x] Server never receives a search query touching plaintext
- [x] Index rebuilds correctly on a fresh device (ADR-006)

---

## M5 — Groups & Channels

### P23 — Groups CRUD
- [x] `groups` table/routes created
- [x] Create/delete by admin/manager implemented
- [x] Group has `key_epoch` starting at 1

### P24 — Membership request/approval
- [x] `group_members` pending→active workflow implemented
- [x] `POST /groups/:id/requests` implemented
- [x] `POST /groups/:id/requests/:reqId/approve` implemented
- [x] `POST /groups/:id/requests/:reqId/reject` implemented
- [x] Approval triggers key-provisioning relay per LLD §3.5
- [x] New member cannot decrypt historical messages by default

### P25 — Group key rotation on removal
- [x] `DELETE /groups/:id/members/:userId` implemented
- [x] Remaining members' clients rotate key epoch, excluding removed member's device keys
- [x] DO transport-level rejection implemented as defense-in-depth
- [x] Removed member's client cannot decrypt any message sent after removal (verified by automated test)

### P26 — Broadcast channels
- [x] `channels` and `channel_members` tables/routes created
- [x] Posting restricted to authorized roles
- [x] `ChannelDO` (read-heavy fan-out variant) implemented
- [x] Employee attempting `POST /channels/:id/posts` directly via API is rejected server-side

### P27 — Channel subscribe/ack
- [x] `POST /channels/:id/requests` implemented
- [x] `POST /channels/:id/posts/:postId/ack` implemented
- [x] Employees can read/react/acknowledge
- [x] Employees cannot post

**M5 Gate:** Full E2E journeys 3 and 4 from Testing Strategy §5 (group join → decrypt; member removal → cannot decrypt) pass before proceeding.

---

## M6 — Files

### P28 — Org file policy
- [x] `org_security_policy` fields created (`allowed_file_types`, `max_file_size_mb`, `external_sharing`)
- [x] Admin settings UI implemented
- [x] Policy editable by Admin+
- [x] Defaults match Database Design §4

### P29 — Upload path
- [x] `POST /files/upload-url` implemented
- [x] `POST /files/:id/complete` implemented
- [x] Client-side chunked encryption before upload implemented
- [x] R2 pre-signed PUT issued
- [x] R2 keys namespaced by `organization_id`
- [x] Policy violation (disallowed mime / oversized) rejected **before** pre-signed URL issuance (`422 FILE_POLICY_VIOLATION`)
- [x] Executables/scripts blocked by default

### P30 — Download path
- [x] `GET /files/:id/download-url` implemented (membership-scoped)
- [x] Cross-org or non-member download attempt fails
- [x] Downloaded blob is ciphertext, decrypted only client-side using the key received via the message

### P31 — Orphan cleanup
- [x] Scheduled Queue job created purging `pending` file rows/R2 objects after 24h
- [x] Orphaned upload never lingers past TTL

### P32 — File UI
- [x] Terminal-style file card (`▤ name  size  ↓ download`) implemented per Frontend Spec §5.2
- [x] No thumbnail-heavy preview tile
- [x] Matches the log-native aesthetic

---

## M7 — Administration & Security Surfaces

### P33 — Admin dashboard
- [x] Members screen implemented
- [x] Groups screen implemented
- [x] Channels screen implemented
- [x] Requests screen implemented
- [x] Org settings screen implemented
- [x] Admin+ only; RBAC-gated per route

### P34 — Security Center
- [x] MFA adoption % displayed
- [x] Verified device % displayed
- [x] Suspended accounts displayed
- [x] Active sessions displayed
- [x] Unrecognized devices displayed
- [x] Bar-meter UI (block-character style, not donut charts) per Frontend Spec §5.6
- [x] Zero message-content exposure anywhere on this surface (FR-ADM-02)
- [x] Metrics sourced from aggregated, non-content data only

### P35 — Audit log UI
- [x] Filterable log viewer (actor/entity/action/date) implemented
- [x] Rendered in the same log-line grammar as the message buffer
- [x] Only roles with audit-read scope can view
- [x] Entries are never editable via any API surface

### P36 — Device/session management (admin)
- [x] Admin can view devices/sessions (metadata only) within their org
- [x] Admin can revoke devices/sessions within their org
- [x] Admin cannot see key material or content
- [x] Revocation immediately invalidates the session/device

### P37 — SSO (OIDC/SAML)
- [x] `/auth/sso/:provider/start` implemented
- [x] `/auth/sso/:provider/callback` implemented
- [x] Entra ID, Google Workspace, Okta supported
- [x] Domain-claim mapping implemented
- [x] Feature-flagged per org in `org_security_policy`/flags table
- [x] Assertion mapped only to a verified domain

---

## M8 — Cross-Cutting Infrastructure & Observability

### P38 — Structured logging
- [x] JSON log envelope implemented per Observability §3
- [x] `request_id` propagated end-to-end
- [x] Lint rule blocks any `console.log`/logger call referencing `ciphertext`/`public_key`/`signing_key` fields

### P39 — Metrics & dashboards
- [x] Golden signals per service emitted
- [x] DO/Queue/D1/R2 metrics collected
- [x] Security Center metrics pipeline implemented
- [x] Engineering dashboard and Security Center read from the same aggregation pipeline
- [x] No per-message content exposed in metrics

### P40 — Alerting
- [x] Alert rules implemented per Observability §5
- [x] Cross-org access-denial spike alert implemented
- [x] Post-deploy Sentry error-rate auto-rollback trigger implemented
- [x] Each alert routes to on-call with correct severity
- [x] Auto-rollback trigger tested in staging

### P41 — Rate limiting
- [x] KV-backed rate limiter implemented
- [x] Applied per API Spec §10 defaults
- [x] Auth endpoints capped at 10 req/min/IP
- [x] Message send capped at 60 req/min/user
- [x] Limits are org-tunable

---

## M9 — Production Readiness

### P42 — Org-isolation regression suite
- [x] Parameterized cross-org test across the full endpoint catalogue from API Spec created
- [x] Runs on every PR touching `services/*` or `middleware/*`
- [x] Blocking in CI

### P43 — Security-specific testing
- [x] Crypto known-answer tests pass in CI
- [x] Fuzz testing wired into CI
- [x] Static/dependency scanning wired into CI
- [x] Penetration test scheduled (tracked, not automatable in-house)

### P44 — Performance pass
- [x] Load test of message-send/fan-out executed
- [x] DO sub-sharding checkpoint evaluated for large channels
- [x] p95 message delivery < 500ms online (NFR-05)
- [x] p95 non-send API < 300ms (NFR-06)

### P45 — CI/CD pipeline
- [x] Full GitHub Actions pipeline implemented per Deployment/CI-CD Spec §4
- [x] PR → develop → staging → release tag → production stages configured
- [x] Every stage gate green
- [x] Preview deploy + Playwright smoke suite runs per PR

### P46 — Backups & DR drill
- [ ] D1/R2 scheduled backup implemented
- [ ] Tested restore procedure per Infrastructure Design §8
- [ ] A restore has actually been executed once against staging (not just documented)

### P47 — Pre-production security gate
- [ ] Independent cryptographic review completed
- [ ] Key-management review completed
- [ ] Group-rotation review completed
- [ ] File-handling review completed
- [ ] Full penetration test completed
- [ ] Every checklist item signed off
- [ ] All critical/high findings remediated before any public E2EE claim

### P48 — Final QA & responsive/accessibility pass
- [ ] Screen-by-screen checklist against Frontend Spec §6 (responsive) completed
- [ ] Screen-by-screen checklist against Frontend Spec §8 (accessibility floor) completed
- [ ] Keyboard-only operation works throughout
- [ ] 360px width without horizontal scroll
- [ ] `prefers-reduced-motion` respected

---

## Release Gate Checklist

Before calling anything "production ready":

- [ ] TypeScript compilation PASS
- [ ] ESLint PASS
- [ ] Unit / Integration / E2E PASS
- [ ] Org-isolation regression suite PASS
- [ ] RBAC authorization tests PASS
- [ ] Crypto known-answer / fuzz tests PASS
- [ ] Security scan (deps + static) PASS
- [ ] D1 migrations VERIFIED
- [ ] Backups + restore drill VERIFIED
- [ ] Independent crypto/security review PASS (gates any public E2EE claim — `07-security-design.md` §13)
- [ ] Penetration test findings REMEDIATED (critical/high)
- [ ] Wrangler deploy + health checks PASS
- [ ] Production smoke test PASS

---

## Critical Gates (non-negotiable)

- [ ] **P9 (`orgScope` middleware) green before P16 (Conversations) starts**
- [ ] **P11 (crypto core) passes known-answer tests before P12 (device registration) starts**
- [ ] **P25 (key rotation on removal) passes automated non-decryption test before M6 starts**
- [ ] **P47 (security gate) passes before any release makes a public E2EE/zero-knowledge claim, regardless of marketing/product pressure (ADR-011)**
