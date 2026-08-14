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
- [ ] Key generation wrappers (X25519 / Ed25519, non-extractable where possible)
- [ ] AEAD encrypt/decrypt (AES-256-GCM / ChaCha20-Poly1305)
- [ ] HKDF derivation wrapper
- [ ] CSPRNG usage only (`crypto.getRandomValues`)
- [ ] Known-answer cryptographic test vectors pass
- [ ] Tampered ciphertext fails AEAD authentication (rejects, never silently corrupts)

### P12 — Device registration
- [ ] `devices` table created
- [ ] `POST /me/devices` implemented
- [ ] `GET /me/devices` implemented
- [ ] `DELETE /me/devices/:deviceId` implemented
- [ ] Client generates device key pair locally, sends public keys only
- [ ] Private keys never leave the device (verified: network tab shows no private key material)
- [ ] Device row created with `status=pending`

### P13 — Device authorization flow
- [ ] `POST /me/devices/:deviceId/authorize` implemented
- [ ] QR / pairing-code UI implemented
- [ ] Existing trusted device relays encrypted key material to new device via server
- [ ] Server relay never decrypts the payload (ciphertext only)
- [ ] New-device flow matches LLD §3.3

### P14 — Identity verification UI
- [ ] QR code / security-number / fingerprint comparison screen implemented
- [ ] Two clients can confirm a matching fingerprint
- [ ] Mismatched fingerprint is visibly flagged

### P15 — Account/key recovery scaffolding
- [ ] `org_security_policy.recovery_policy` field created (`device_only` default)
- [ ] Recovery-policy selection in org settings implemented
- [ ] Device-only path fully implemented
- [ ] Enterprise-key and user-backup stubbed behind feature flags
- [ ] Password reset never returns/derives key material (ADR-010 regression test)
- [ ] Device-only recovery works end to end

**M3 Gate:** Crypto round-trip test suite is green and independently re-reviewed by a second contributor per code-owner requirement before proceeding to M4.

---

## M4 — Messaging Core

### P16 — Conversations (1:1)
- [ ] `conversations` and `conversation_members` tables/routes created
- [ ] `POST /conversations` implemented
- [ ] `GET /conversations` implemented
- [ ] Conversation creation is org- and membership-scoped
- [ ] Cross-org attempt fails per P9's contract

### P17 — `ConversationDO`
- [ ] Durable Object per `conversation_id` created
- [ ] Connected-socket registry implemented
- [ ] Message sequencing implemented
- [ ] Fan-out implemented
- [ ] One DO per conversation verified
- [ ] Strict per-conversation ordering verified under concurrent sends

### P18 — Message send/receive path
- [ ] `GET /conversations/:id/messages` implemented
- [ ] `POST /conversations/:id/messages` implemented
- [ ] `GET /conversations/:id/keys` implemented
- [ ] Full path matches LLD §3.4
- [ ] End-to-end verified: client encrypts → D1 persists ciphertext → DO pushes to online recipient's WebSocket
- [ ] Matches sequence diagram in LLD §5

### P19 — Offline delivery
- [ ] `offline-delivery` Queue created
- [ ] `notification-worker` consumer implemented
- [ ] Generic (content-free) push payload implemented
- [ ] Offline recipient receives ciphertext on reconnect
- [ ] Push notification contains no plaintext or ciphertext (FR-MSG-07, ADR-009)

### P20 — Realtime WebSocket protocol
- [ ] `wss://.../v1/realtime` endpoint implemented per API Spec §9
- [ ] subscribe frame handled
- [ ] ack frame handled
- [ ] typing frame handled
- [ ] presence frame handled
- [ ] Client frames and server frames match the spec exactly
- [ ] Reconnect resubscribes to current membership list

### P21 — Message buffer UI ("the log")
- [ ] Log-line message rendering (not bubbles) implemented
- [ ] Consecutive-message collapsing implemented
- [ ] Handshake Sequence implemented (plays once per conversation per session)
- [ ] Typing indicator implemented
- [ ] Reactions rendered as inline tokens
- [ ] No per-message encryption badge exists anywhere (explicit anti-pattern in Frontend Spec §9)

### P22 — Local search index
- [ ] IndexedDB-backed decrypted index built client-side on message decrypt
- [ ] Server never receives a search query touching plaintext
- [ ] Index rebuilds correctly on a fresh device (ADR-006)

---

## M5 — Groups & Channels

### P23 — Groups CRUD
- [ ] `groups` table/routes created
- [ ] Create/delete by admin/manager implemented
- [ ] Group has `key_epoch` starting at 1

### P24 — Membership request/approval
- [ ] `group_members` pending→active workflow implemented
- [ ] `POST /groups/:id/requests` implemented
- [ ] `POST /groups/:id/requests/:reqId/approve` implemented
- [ ] `POST /groups/:id/requests/:reqId/reject` implemented
- [ ] Approval triggers key-provisioning relay per LLD §3.5
- [ ] New member cannot decrypt historical messages by default

### P25 — Group key rotation on removal
- [ ] `DELETE /groups/:id/members/:userId` implemented
- [ ] Remaining members' clients rotate key epoch, excluding removed member's device keys
- [ ] DO transport-level rejection implemented as defense-in-depth
- [ ] Removed member's client cannot decrypt any message sent after removal (verified by automated test)

### P26 — Broadcast channels
- [ ] `channels` and `channel_members` tables/routes created
- [ ] Posting restricted to authorized roles
- [ ] `ChannelDO` (read-heavy fan-out variant) implemented
- [ ] Employee attempting `POST /channels/:id/posts` directly via API is rejected server-side

### P27 — Channel subscribe/ack
- [ ] `POST /channels/:id/requests` implemented
- [ ] `POST /channels/:id/posts/:postId/ack` implemented
- [ ] Employees can read/react/acknowledge
- [ ] Employees cannot post

**M5 Gate:** Full E2E journeys 3 and 4 from Testing Strategy §5 (group join → decrypt; member removal → cannot decrypt) pass before proceeding.

---

## M6 — Files

### P28 — Org file policy
- [ ] `org_security_policy` fields created (`allowed_file_types`, `max_file_size_mb`, `external_sharing`)
- [ ] Admin settings UI implemented
- [ ] Policy editable by Admin+
- [ ] Defaults match Database Design §4

### P29 — Upload path
- [ ] `POST /files/upload-url` implemented
- [ ] `POST /files/:id/complete` implemented
- [ ] Client-side chunked encryption before upload implemented
- [ ] R2 pre-signed PUT issued
- [ ] R2 keys namespaced by `organization_id`
- [ ] Policy violation (disallowed mime / oversized) rejected **before** pre-signed URL issuance (`422 FILE_POLICY_VIOLATION`)
- [ ] Executables/scripts blocked by default

### P30 — Download path
- [ ] `GET /files/:id/download-url` implemented (membership-scoped)
- [ ] Cross-org or non-member download attempt fails
- [ ] Downloaded blob is ciphertext, decrypted only client-side using the key received via the message

### P31 — Orphan cleanup
- [ ] Scheduled Queue job created purging `pending` file rows/R2 objects after 24h
- [ ] Orphaned upload never lingers past TTL

### P32 — File UI
- [ ] Terminal-style file card (`▤ name  size  ↓ download`) implemented per Frontend Spec §5.2
- [ ] No thumbnail-heavy preview tile
- [ ] Matches the log-native aesthetic

---

## M7 — Administration & Security Surfaces

### P33 — Admin dashboard
- [ ] Members screen implemented
- [ ] Groups screen implemented
- [ ] Channels screen implemented
- [ ] Requests screen implemented
- [ ] Org settings screen implemented
- [ ] Admin+ only; RBAC-gated per route

### P34 — Security Center
- [ ] MFA adoption % displayed
- [ ] Verified device % displayed
- [ ] Suspended accounts displayed
- [ ] Active sessions displayed
- [ ] Unrecognized devices displayed
- [ ] Bar-meter UI (block-character style, not donut charts) per Frontend Spec §5.6
- [ ] Zero message-content exposure anywhere on this surface (FR-ADM-02)
- [ ] Metrics sourced from aggregated, non-content data only

### P35 — Audit log UI
- [ ] Filterable log viewer (actor/entity/action/date) implemented
- [ ] Rendered in the same log-line grammar as the message buffer
- [ ] Only roles with audit-read scope can view
- [ ] Entries are never editable via any API surface

### P36 — Device/session management (admin)
- [ ] Admin can view devices/sessions (metadata only) within their org
- [ ] Admin can revoke devices/sessions within their org
- [ ] Admin cannot see key material or content
- [ ] Revocation immediately invalidates the session/device

### P37 — SSO (OIDC/SAML)
- [ ] `/auth/sso/:provider/start` implemented
- [ ] `/auth/sso/:provider/callback` implemented
- [ ] Entra ID, Google Workspace, Okta supported
- [ ] Domain-claim mapping implemented
- [ ] Feature-flagged per org in `org_security_policy`/flags table
- [ ] Assertion mapped only to a verified domain

---

## M8 — Cross-Cutting Infrastructure & Observability

### P38 — Structured logging
- [ ] JSON log envelope implemented per Observability §3
- [ ] `request_id` propagated end-to-end
- [ ] Lint rule blocks any `console.log`/logger call referencing `ciphertext`/`public_key`/`signing_key` fields

### P39 — Metrics & dashboards
- [ ] Golden signals per service emitted
- [ ] DO/Queue/D1/R2 metrics collected
- [ ] Security Center metrics pipeline implemented
- [ ] Engineering dashboard and Security Center read from the same aggregation pipeline
- [ ] No per-message content exposed in metrics

### P40 — Alerting
- [ ] Alert rules implemented per Observability §5
- [ ] Cross-org access-denial spike alert implemented
- [ ] Post-deploy Sentry error-rate auto-rollback trigger implemented
- [ ] Each alert routes to on-call with correct severity
- [ ] Auto-rollback trigger tested in staging

### P41 — Rate limiting
- [ ] KV-backed rate limiter implemented
- [ ] Applied per API Spec §10 defaults
- [ ] Auth endpoints capped at 10 req/min/IP
- [ ] Message send capped at 60 req/min/user
- [ ] Limits are org-tunable

---

## M9 — Production Readiness

### P42 — Org-isolation regression suite
- [ ] Parameterized cross-org test across the full endpoint catalogue from API Spec created
- [ ] Runs on every PR touching `services/*` or `middleware/*`
- [ ] Blocking in CI

### P43 — Security-specific testing
- [ ] Crypto known-answer tests pass in CI
- [ ] Fuzz testing wired into CI
- [ ] Static/dependency scanning wired into CI
- [ ] Penetration test scheduled (tracked, not automatable in-house)

### P44 — Performance pass
- [ ] Load test of message-send/fan-out executed
- [ ] DO sub-sharding checkpoint evaluated for large channels
- [ ] p95 message delivery < 500ms online (NFR-05)
- [ ] p95 non-send API < 300ms (NFR-06)

### P45 — CI/CD pipeline
- [ ] Full GitHub Actions pipeline implemented per Deployment/CI-CD Spec §4
- [ ] PR → develop → staging → release tag → production stages configured
- [ ] Every stage gate green
- [ ] Preview deploy + Playwright smoke suite runs per PR

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
