# Qyx — Secure Enterprise Communications Platform — Implementation Guide (Agent Entry Point)

**Read this file first.** It is the operating manual for building this platform. It doesn't
repeat every detail from the other docs — it tells you the rules, the order, and where to
look. The full source-of-truth documents live alongside this file:

| Doc | Purpose | When to consult |
|---|---|---|
| `01-project-specification-prd.md` | Product vision, personas, use cases, v1 scope, non-goals | Before starting any new feature area |
| `02-srs-software-requirements-specification.md` | Numbered functional/non-functional requirements (FR-*/NFR-*) | Before implementing any requirement — cite the ID |
| `03-system-architecture-hld.md` | Components, responsibilities, data stores, key flows | Before writing backend code |
| `04-lld-tds-low-level-design.md` | Module structure, algorithms, state machines, sequence diagrams | Before implementing auth, messaging, groups, files, recovery |
| `05-database-design.md` | D1 schema DDL, KV/R2 usage, query-scoping convention, migrations | Before writing any schema, query, or migration |
| `06-api-specification.md` | REST endpoint catalogue, request/response shapes, WebSocket protocol, error codes | Before writing any route |
| `07-security-design.md` | Threat model, crypto architecture, org isolation, recovery, audit | Before writing ANY crypto, auth, or org-scoping code |
| `08-infrastructure-design.md` | Cloudflare resource topology, environments, scaling, IaC | Before touching `wrangler.toml`/deployment config |
| `09-testing-strategy.md` | Test pyramid, coverage targets, security-specific tests, CI gates | Before declaring any module done |
| `10-deployment-cicd-specification.md` | Branching, pipeline stages, rollback, migration policy | Before setting up CI/CD or shipping a release |
| `11-observability-operations.md` | Logging/metrics/alerting standards, incident response, runbooks | Before instrumenting any service |
| `12-adrs-architecture-decision-records.md` | Why key decisions were made, and what was rejected | Before proposing an architectural change |
| `13-frontend-specification.md` | Design tokens, layout ("IDE" shell), motion, component conventions | Before building any screen or component |

If two documents conflict, **stop and report the conflict** — do not guess.

---

## 1. Stack (fixed, do not substitute)

- Frontend: React + TypeScript + Vite, Tailwind CSS + shadcn/ui (re-skinned, not default), Zustand
- Backend: TypeScript + Hono on Cloudflare Workers
- Realtime: Cloudflare Durable Objects (`ConversationDO`, `ChannelDO`) + WebSockets
- Database: Cloudflare D1 (SQLite dialect)
- Blob storage: Cloudflare R2 (encrypted attachments/avatars only)
- Cache/session/ephemeral: Cloudflare KV
- Async/background: Cloudflare Queues (offline delivery, email, audit)
- Client-side crypto: Web Crypto API only — X25519, Ed25519, AES-256-GCM/ChaCha20-Poly1305, HKDF, CSPRNG (`crypto.getRandomValues`)
- Auth: session JWT (15 min access + rotating refresh token, httpOnly, KV-tracked for revocation)
- Validation: Zod, shared between frontend/backend via `packages/schemas`
- API: REST/JSON at `/v1`, documented via OpenAPI (`zod-to-openapi`)
- Package manager: pnpm, monorepo workspace
- Deploy: Wrangler, GitHub Actions CI/CD
- Font: JetBrains Mono (single family, every role) — design tokens in §5
- Error tracking: Sentry (frontend + Workers). Transactional email: Resend.

---

## 2. Rules that override everything else

These are repeated across every source document because violating any one of them is a
security failure, not a style preference.

1. **Server never sees plaintext.** Message content and file content are encrypted
   client-side before they ever leave the device. Workers/D1/R2/Durable Objects store and
   route ciphertext only — never plaintext, never a key capable of decrypting it. (NFR-01,
   ADR-003, ADR-006)
2. **No custom cryptography, ever.** Only Web Crypto API primitives and the specified
   established protocol design (X25519, Ed25519, AES-256-GCM/ChaCha20-Poly1305, HKDF,
   double-ratchet-style sessions). Do not invent, simplify, or "temporarily" substitute a
   weaker scheme "for now." (ADR-003)
3. **Organization isolation is enforced redundantly at four layers, every time:**
   API/session derivation → D1 query scoping (`organization_id` always in `WHERE`) →
   RBAC evaluation → storage/encryption namespacing (R2 keys prefixed by org). A bug in one
   layer must never be sufficient to leak across orgs. (ADR-002, Security Design §5)
4. **`organization_id` is never trusted from the client.** It is always derived from the
   verified session server-side. If a request body contains a conflicting `organization_id`,
   reject it — never silently use it. (FR-ORG-05, API Spec §2)
5. **No hard deletes on users.** Lifecycle is `active → suspended → deactivated`. The UI
   may say "Remove employee"; the backend never deletes the row or its historical
   references. (FR-ORG-09, ADR-007)
6. **Password reset and key recovery are permanently decoupled.** Resetting a password must
   never yield decrypted key material or silently re-provision message-decryption keys.
   (ADR-010)
7. **No public "zero-knowledge" / "full E2EE" marketing claims** anywhere in the product
   (including copy, empty states, onboarding) until the independent security review gate in
   `07-security-design.md` §13 has been passed. If you are asked to write copy that makes
   this claim, flag it instead of writing it. (ADR-011)
8. **Every backend module follows Route → Middleware(auth → orgScope → rbac → validate) →
   Service → Repository/Query-helper → D1/R2/DO.** Never skip a layer. Never write a raw
   `db.prepare()` call outside `db/queries/*`. Every query helper takes `orgId` as a
   mandatory first parameter — there is no overload without it. (LLD §2, §3.1; Database
   Design §6)

---

## 3. Repository layout

```
qyx/
├── apps/
│   ├── web/                    React SPA (Vite)
│   └── api-gateway/            Hono app on Workers (Identity/Org/Messaging/Group/Channel/File routes)
├── workers/
│   ├── notification-worker/    Queue consumer → push + Resend email
│   └── audit-worker/           Queue consumer → security metrics aggregation
├── packages/
│   ├── schemas/                Zod schemas shared frontend/backend, zod-to-openapi source
│   ├── crypto/                 Web Crypto wrappers (client: encrypt/decrypt/ratchet; server: signature verification only)
│   ├── ui/                     Shared React components, re-skinned shadcn primitives
│   └── config/                 eslint, tsconfig, tailwind config
├── migrations/                 Versioned D1 SQL migrations (0001_init.sql, ...)
├── docs/                       this file + the 13 source documents
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

Backend module pattern (apply to every logical service — Identity, Organization, Messaging,
Group, Channel, File — see `04-lld-tds-low-level-design.md` §2):

```
services/<name>/
├── <name>.routes.ts
├── <name>.service.ts
├── <name>.schema.ts        (Zod)
├── <name>.types.ts
└── index.ts

middleware/
├── auth.ts                 # session/JWT verification, attaches ctx.user
├── orgScope.ts              # enforces organization_id match (FR-ORG-05)
├── rbac.ts                   # role/permission checks
├── rateLimit.ts               # KV-backed rate limiting
└── validate.ts                 # Zod schema validation wrapper

db/
├── schema.ts                # D1 typed schema layer
└── queries/                  # scoped query builders — every helper requires orgId first param
```

Frontend feature pattern (see `13-frontend-specification.md` §7):

```
features/<name>/
├── api/              generated client calls, no raw fetch() in components
├── components/
├── hooks/
├── stores/           Zustand slices (UI state kept separate from domain/E2EE data state)
├── crypto/           feature-specific use of packages/crypto (never re-implements primitives)
└── types/
```

Request flow, always: `Client (encrypt) → Route → auth → orgScope → rbac → validate →
Service → D1/R2/DO (ciphertext only)`. Never skip layers. Never let a query helper perform
authorization, and never let a service assume the client-supplied `organization_id` is
correct.

---

## 4. Build order (do not reorder milestones)

Build **vertical slices**, not "all frontend then all backend." Every phase must be schema +
API + RBAC/orgScope + service + crypto (where applicable) + React UI + loading/error states +
tests before moving to the next. Milestones (M1–M9) are checkpoints; phases (P0, P1, P2…) are
units of work — hand phases to the agent one at a time, in order, using the task format in
§11. Don't start a phase whose `Depends on` isn't fully at Definition of Done (§9).

### M1 — Foundation

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P0 | Repo & Cloudflare init | — | `apps/web`, `apps/api-gateway`, `workers/*`, `packages/*`; pnpm workspace; TS/ESLint/Prettier/Tailwind configured; `wrangler.toml` per environment (dev/staging/prod) with D1/R2/KV/DO/Queue bindings declared per `08-infrastructure-design.md` §4 | `pnpm install && pnpm dev && pnpm build && pnpm test && pnpm lint && pnpm typecheck` all exit 0; `wrangler deploy --dry-run` succeeds for every environment |
| P1 | D1 schema & migrations | P0 | `migrations/0001_init.sql` implementing the full DDL in `05-database-design.md` §4; migration runner wired to `wrangler d1 migrations apply` | Fresh D1 instance migrates cleanly; every tenant-owned table has `organization_id` + index (checked against Database Design §6/§7) |
| P2 | Shared contracts | P0 | `packages/schemas` (Zod types/constants), `packages/crypto` scaffolding (empty wrappers with signatures defined, no logic yet) | Both `apps/web` and `apps/api-gateway` import from `packages/*` without circular deps |
| P3 | Design system | P0 | Design tokens (§5 below) wired into Tailwind config; JetBrains Mono self-hosted variable font; re-skinned shadcn primitives (Dialog, Popover, Command, Dropdown, Button, Input, Badge, Toast) per `13-frontend-specification.md` §7 | No component hardcodes a hex color outside the token file; nothing visually recognizable as "default shadcn" |
| P4 | App shell | P3 | Three-pane shell (Directory / Buffer / Inspector), Status Bar (28px, always visible), Command Palette (`⌘K`) skeleton per `13-frontend-specification.md` §3.3–3.5 | Shell renders with placeholder content at desktop/tablet/mobile widths per §6 of that doc; keyboard-only navigation works end to end |

### M2 — Identity & Organization (do not skip or reorder any phase here)

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P5 | Organizations & domain verification | P1, P2 | `organizations`, `domains` tables/routes; DNS TXT-record challenge/response verification flow | `POST /organizations` creates org (creator becomes Super Admin); domain unverified until TXT check passes (ADR-008); org creation blocked without it |
| P6 | Users & RBAC roles | P5 | `users` table; role enum (`super_admin/admin/manager/employee/security_admin` — v1 ships `super_admin/admin/employee`, others feature-flagged); `rbac.ts` middleware | Only Super Admin can create orgs; only Admin+ can add/suspend users within their own org; least-privilege default deny (FR-RBAC-01–05) |
| P7 | Authentication | P6 | `/auth/register`, `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`, `/me`; password hashing; TOTP (RFC 6238); login rate limiting via KV | Login state machine matches `04-lld-tds-low-level-design.md` §3.2 exactly; MFA mandatory and enforced for Super Admin/Admin (FR-AUTH-04) |
| P8 | Passkeys / WebAuthn | P7 | WebAuthn registration + authentication ceremonies; single-use challenge in KV (`webauthn:{userId}`, 5 min TTL) | Passkey login succeeds; replayed/expired challenge rejected |
| P9 | `orgScope` middleware | P6 | `middleware/orgScope.ts` implementing the algorithm in `04-lld-tds-low-level-design.md` §3.1 | Cross-org resource fetch by guessed valid ID → `403`/`ORG_SCOPE_VIOLATION`, audited, response body indistinguishable from `404` |
| P10 | Audit infrastructure | P6, P9 | `audit_events` table; `audit.log()` service helper wired into request lifecycle, no update/delete API surface | Login, logout, and every M2 write produce an audit record; `metadata` never contains content or key material (grep check in CI) |

**Gate: do not proceed to M3 until every cross-org isolation test scenario in
`09-testing-strategy.md` §4/§5 that touches Identity/Organization passes.**

### M3 — Device Identity & Client-Side Cryptography

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P11 | `packages/crypto` core | P2 | Web Crypto wrappers: key generation (X25519/Ed25519, non-extractable where possible), AEAD encrypt/decrypt (AES-256-GCM/ChaCha20-Poly1305), HKDF derivation, CSPRNG usage only | Known-answer cryptographic test vectors pass; tampered ciphertext fails AEAD authentication (rejects, never silently corrupts) — per `09-testing-strategy.md` §3/§6 |
| P12 | Device registration | P7, P11 | `devices` table; `POST/GET/DELETE /me/devices`; client generates device key pair locally, sends public keys only | Private keys never leave the device (verified: network tab shows no private key material); device row created `status=pending` |
| P13 | Device authorization flow | P12 | `POST /me/devices/:deviceId/authorize`; QR/pairing-code UI; existing trusted device relays encrypted key material to new device via server (ciphertext only) | New-device flow matches `04-lld-tds-low-level-design.md` §3.3; server relay never decrypts the payload |
| P14 | Identity verification UI | P12 | QR code / security-number / fingerprint comparison screen | Two clients can confirm a matching fingerprint; mismatched fingerprint is visibly flagged |
| P15 | Account/key recovery scaffolding | P12 | `org_security_policy.recovery_policy` (`device_only` default); recovery-policy selection in org settings; device-only path fully implemented, enterprise-key/user-backup stubbed behind feature flags | Password reset never returns/derives key material (ADR-010 regression test); device-only recovery works end to end |

**Gate: do not proceed to M4 until the crypto round-trip test suite (`09-testing-strategy.md`
§3) is green and independently re-reviewed by a second contributor per the code-owner
requirement in `10-deployment-cicd-specification.md` §3.**

### M4 — Messaging Core

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P16 | Conversations (1:1) | M2, M3 | `conversations`, `conversation_members` tables/routes; `POST/GET /conversations` | Conversation creation is org- and membership-scoped; cross-org attempt fails per P9's contract |
| P17 | `ConversationDO` | P16 | Durable Object per `conversation_id`: connected-socket registry, message sequencing, fan-out | One DO per conversation; strict per-conversation ordering verified under concurrent sends |
| P18 | Message send/receive path | P17, P11 | `GET/POST /conversations/:id/messages`, `GET /conversations/:id/keys`; full path per `04-lld-tds-low-level-design.md` §3.4 | End-to-end: client encrypts → D1 persists ciphertext → DO pushes to online recipient's WebSocket, matches sequence diagram in LLD §5 |
| P19 | Offline delivery | P18 | `offline-delivery` Queue; `notification-worker` consumer; generic (content-free) push payload | Offline recipient receives ciphertext on reconnect; push notification contains no plaintext or ciphertext (FR-MSG-07, ADR-009) |
| P20 | Realtime WebSocket protocol | P17 | `wss://.../v1/realtime` per `06-api-specification.md` §9; subscribe/ack/typing frames; presence | Client frames and server frames match the spec exactly; reconnect resubscribes to current membership list |
| P21 | Message buffer UI ("the log") | P18, P20 | Log-line message rendering (not bubbles), consecutive-message collapsing, Handshake Sequence, typing indicator, reactions as inline tokens — per `13-frontend-specification.md` §5.2 | No per-message encryption badge exists anywhere (explicit anti-pattern in that doc §9); Handshake Sequence plays once per conversation per session |
| P22 | Local search index | P21 | IndexedDB-backed decrypted index built client-side on message decrypt | Server never receives a search query touching plaintext; index rebuilds correctly on a fresh device (ADR-006) |

### M5 — Groups & Channels

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P23 | Groups CRUD | M4 | `groups` table/routes; create/delete by admin/manager | Group has `key_epoch` starting at 1 |
| P24 | Membership request/approval | P23 | `group_members` pending→active workflow; `POST /groups/:id/requests`, `/approve`, `/reject` | Approval triggers key-provisioning relay per LLD §3.5; new member cannot decrypt historical messages by default |
| P25 | Group key rotation on removal | P24 | `DELETE /groups/:id/members/:userId`; remaining members' clients rotate key epoch, excluding removed member's device keys; DO transport-level rejection as defense-in-depth | Removed member's client cannot decrypt any message sent after removal, verified by an automated test, not just a manual check |
| P26 | Broadcast channels | M4 | `channels`, `channel_members` tables/routes; posting restricted to authorized roles; `ChannelDO` (read-heavy fan-out variant) | Employee attempting to `POST /channels/:id/posts` directly via API (bypassing UI) is rejected server-side, not just hidden client-side |
| P27 | Channel subscribe/ack | P26 | `POST /channels/:id/requests`, `/posts/:postId/ack` | Employees can read/react/acknowledge; cannot post |

**Gate: run the full E2E journeys 3 and 4 from `09-testing-strategy.md` §5 (group join →
decrypt; member removal → cannot decrypt) before proceeding.**

### M6 — Files

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P28 | Org file policy | P6 | `org_security_policy` fields (`allowed_file_types`, `max_file_size_mb`, `external_sharing`); admin settings UI | Policy editable by Admin+; defaults match `05-database-design.md` §4 |
| P29 | Upload path | P28, P11 | `POST /files/upload-url`, `POST /files/:id/complete`; client-side chunked encryption before upload; R2 pre-signed PUT, key-namespaced by `organization_id` | Policy violation (disallowed mime/oversized) rejected **before** a pre-signed URL is issued (`422 FILE_POLICY_VIOLATION`); executables/scripts blocked by default |
| P30 | Download path | P29 | `GET /files/:id/download-url` (membership-scoped) | Cross-org or non-member download attempt fails; downloaded blob is ciphertext, decrypted only client-side using the key received via the message |
| P31 | Orphan cleanup | P29 | Scheduled Queue job purging `pending` file rows/R2 objects after 24h | Orphaned upload never lingers past TTL |
| P32 | File UI | P29, P30 | Terminal-style file card (`▤ name  size  ↓ download`) per `13-frontend-specification.md` §5.2 | No thumbnail-heavy preview tile; matches the log-native aesthetic |

### M7 — Administration & Security Surfaces

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P33 | Admin dashboard | M2 | Members, groups, channels, requests, org settings screens | Admin+ only; RBAC-gated per route |
| P34 | Security Center | P10 | MFA adoption %, verified device %, suspended accounts, active sessions, unrecognized devices — bar-meter UI (block-character style, not donut charts) per `13-frontend-specification.md` §5.6 | Zero message-content exposure anywhere on this surface (FR-ADM-02); metrics sourced from aggregated, non-content data only |
| P35 | Audit log UI | P10 | Filterable log viewer (actor/entity/action/date), rendered in the same log-line grammar as the message buffer | Only roles with audit-read scope can view; entries are never editable via any API surface |
| P36 | Device/session management (admin) | P12 | Admin can view (metadata only) and revoke devices/sessions within their org | Admin cannot see key material or content; revocation immediately invalidates the session/device |
| P37 | SSO (OIDC/SAML) | P7 | `/auth/sso/:provider/start`, `/callback` for Entra ID, Google Workspace, Okta; domain-claim mapping | Feature-flagged per org in `org_security_policy`/flags table; assertion mapped only to a verified domain |

### M8 — Cross-Cutting Infrastructure & Observability

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P38 | Structured logging | P0 | JSON log envelope per `11-observability-operations.md` §3; `request_id` propagated end-to-end | Lint rule blocks any `console.log`/logger call referencing `ciphertext`/`public_key`/`signing_key` fields |
| P39 | Metrics & dashboards | P38 | Golden signals per service; DO/Queue/D1/R2 metrics; Security Center metrics pipeline | Engineering dashboard and Security Center both read from the same aggregation pipeline, never per-message content |
| P40 | Alerting | P39 | Alert rules per `11-observability-operations.md` §5, including cross-org access-denial spike and post-deploy Sentry error-rate auto-rollback trigger | Each alert routes to on-call with correct severity; auto-rollback trigger tested in staging |
| P41 | Rate limiting | P0 | KV-backed rate limiter applied per `06-api-specification.md` §10 defaults | Auth endpoints capped at 10 req/min/IP; message send at 60 req/min/user; limits are org-tunable |

### M9 — Production Readiness

| Phase | Title | Depends on | Deliverable | Exit check |
|---|---|---|---|---|
| P42 | Org-isolation regression suite | All prior | Parameterized cross-org test across the full endpoint catalogue from `06-api-specification.md` | Runs on every PR touching `services/*` or `middleware/*`; blocking (`09-testing-strategy.md` §4, §8) |
| P43 | Security-specific testing | P42 | Crypto known-answer tests, fuzz testing, static/dependency scanning wired into CI | All pass in CI; penetration test scheduled (tracked, not automatable in-house) |
| P44 | Performance pass | All prior | Load test of message-send/fan-out; DO sub-sharding checkpoint evaluated for large channels | p95 message delivery < 500ms online; p95 non-send API < 300ms (NFR-05/06) |
| P45 | CI/CD pipeline | P0 | Full GitHub Actions pipeline per `10-deployment-cicd-specification.md` §4 (PR → develop → staging → release tag → production) | Every stage gate green; preview deploy + Playwright smoke suite runs per PR |
| P46 | Backups & DR drill | P8 (infra) | D1/R2 scheduled backup; a **tested** restore procedure per `08-infrastructure-design.md` §8 | A restore has actually been executed once against staging, not just documented (`09-testing-strategy.md` §10) |
| P47 | Pre-production security gate | P43 | Independent cryptographic/key-management/group-rotation/file-handling review + full penetration test, per `07-security-design.md` §13 | Every checklist item signed off; all critical/high findings remediated **before** any public E2EE claim is made |
| P48 | Final QA & responsive/accessibility pass | All prior | Screen-by-screen checklist against `13-frontend-specification.md` §6 (responsive) and §8 (accessibility floor) | Keyboard-only operation works throughout; 360px width without horizontal scroll; `prefers-reduced-motion` respected |

Gate reminders:
- **P9 (`orgScope` middleware) must be green before P16 (Conversations) starts.**
- **P11 (crypto core) must pass known-answer tests before P12 (device registration) starts.**
- **P25 (key rotation on removal) must pass its automated non-decryption test before M6 starts.**
- **P47 (security gate) must pass before any release makes a public E2EE/zero-knowledge claim, regardless of what marketing or product wants to ship (ADR-011).**

---

## 5. Design tokens (copy verbatim, do not invent new colors or a second typeface)

```css
--bg-void: #0A0D0E;
--bg-surface: #10161A;
--bg-raised: #161E22;
--border-hairline: #212B2E;
--border-focus: #2B383C;
--text-primary: #DCE6E3;
--text-secondary: #7C8E8A;
--text-dim: #4A5B58;
--signal-cipher: #2EE6A8;      /* verified/online/encrypted state only — never a generic brand color */
--signal-amber: #F0B849;       /* pending, warnings, unverified device */
--signal-violet: #B695F5;      /* mentions, admin actions, Handshake Sequence glow */
--signal-red: #F0575A;         /* errors, revoked, destructive */
--signal-cipher-dim: rgba(46, 230, 168, 0.12); /* ambient glows, encrypted-badge backgrounds */
```

- Single font family for every role: **JetBrains Mono** (self-hosted variable font). No second
  typeface, ever — see `13-frontend-specification.md` §3.2, §9.
- Border radius: **3px** everywhere. No drop shadows for elevation — hairline borders +
  `--bg-raised` background shifts only.
- Layout is a three-pane IDE shell (Directory / Buffer / Inspector) + a persistent 28px status
  bar + a `⌘K` command palette as primary navigation. Full spec, component conventions, motion
  language, and explicit anti-patterns ("what this avoids") are in `13-frontend-specification.md`
  §3–§9 — read it before building any screen. Do not default to a generic sidebar-plus-cards
  SaaS template; do not add chat bubbles, avatars-as-primary-identity, donut charts, gradient
  hero sections, or per-message lock icons.

---

## 6. Security & RBAC quick reference

Full model in `07-security-design.md` and `05-database-design.md` §4 (`org_security_policy`).
Minimum an agent must hold in working memory:

- Decision = `authenticated AND organizationMember AND hasPermission AND withinScope`.
  Default is **deny**.
- Roles (v1): Super Admin, Admin, Employee. Manager and Security Admin are phase-2 role
  splits — build the RBAC engine so adding them later doesn't require a rewrite (`07-security-
  design.md` §12).
- HTTP semantics: unauthenticated → 401; MFA required but not completed → mapped to
  `MFA_REQUIRED`; authenticated but lacking role → 403; cross-org or nonexistent resource →
  same response shape as 404 (`ORG_SCOPE_VIOLATION` differs only in internal logging, never in
  the response body — API Spec §3).
- Every persisted domain object carries `organization_id`; every query filters on it; no query
  helper exists that omits it.
- The server never holds a key capable of decrypting message or file content. If a task
  description asks you to add server-side plaintext search, content moderation, or a
  "convenient" server-side key-recovery shortcut, stop and flag it — it contradicts the
  architecture (ADR-003, ADR-006, ADR-010).
- Audit events capture security/administrative actions only, never content. No update/delete
  API surface for audit logs beyond retention-driven purges.
- Push notifications are content-free by default; message previews are an explicit, audited,
  org-level opt-in (ADR-009).

Required-before-M4 test matrix (from `09-testing-strategy.md` §4, re-run in CI thereafter):

- Cross-org resource access (conversation/group/channel/file) by guessed valid ID → denied for
  every endpoint in the API catalogue.
- `orgScope` middleware denies access when session org ≠ resource org, for every resource type.
- RBAC matrix: for each (role × action) pair in the PRD/Security Design permission table, assert
  allow/deny matches spec.
- Encrypt → transmit (mocked) → decrypt round-trip produces original plaintext; tampered
  ciphertext fails AEAD authentication.
- Group member removal → removed device rejected at DO connect time AND cannot decrypt new
  ciphertext even if it somehow received the frame.

---

## 7. Database & API — what to check before coding any module

For every entity, before writing code, confirm in `05-database-design.md`:

1. The exact table definition and required columns (§4 DDL)
2. `organization_id` is present and indexed for any tenant-owned table (§6/§7 pattern)
3. Whether the column is ciphertext-opaque (`messages.ciphertext`, file blobs) — never add a
   plaintext content column to a table that isn't explicitly designed to hold it
4. Status-driven lifecycle conventions (`users.status`, `devices.status`, `group_members.status`,
   `files.status`) rather than deletion
5. Any foreign ID (`conversation_id`, `group_id`, `channel_id`, `attachment_ref`...) is
   re-validated server-side as belonging to the same `organization_id` — never assume a
   client-supplied ID is trustworthy

For every route, before writing code, confirm in `06-api-specification.md`:

- Base path `/v1`, standard error envelope `{ error: { code, message, request_id } }`
- Cursor pagination (`?cursor=&limit=`), response includes `next_cursor`
- `organization_id` is never accepted as a client-supplied field for authorization — session-
  derived only, per §2
- Required role/permission per endpoint (§5–§8 tables)
- Rate limit class the endpoint falls under (§10)
- For realtime behavior, the exact client→server and server→client frame shapes in §9 — don't
  invent new frame types without updating that doc first

---

## 8. Cross-cutting infrastructure (build once, reuse everywhere)

- **Audit logging**: every sensitive write goes through one `audit.log()` service call inside
  the service layer, never scattered through routes.
- **Async/outbox pattern**: state-changing operations that need to notify
  notifications/webhooks/offline-delivery emit through Cloudflare Queues and a worker consumer,
  not inline side effects in the request path (`04-lld-tds-low-level-design.md` §3.4, §4).
- **Validation**: all external input (query, params, body, WebSocket frames) goes through Zod
  from `packages/schemas`. No exceptions.
- **Error handling**: standardized `{ error: { code, message, request_id } }` shape; never leak
  D1 errors, stack traces, or file paths to the client; `ORG_SCOPE_VIOLATION` never confirms the
  existence of another org's resource.
- **Observability**: every request gets a `request_id` propagated through Worker → DO → Queue
  consumer; structured JSON logs; never log ciphertext, plaintext, key material, passwords, or
  session tokens (`11-observability-operations.md` §3).
- **Crypto**: all client-side crypto goes through `packages/crypto` — no component reimplements
  or inlines a Web Crypto call outside that package.

---

## 9. Definition of Done (per phase/module)

A phase is not complete until every box below is true — this applies at the end of every
milestone slice, not just at the very end of the project:

```
Backend
[ ] D1 table(s) + indexes, organization_id present and indexed where tenant-owned
[ ] Zod request/response schemas in packages/schemas
[ ] Query helpers in db/queries/* (org-scoped, no bare db.prepare elsewhere)
[ ] Service (business rules, audit, events/outbox)
[ ] Routes wired through auth -> orgScope -> rbac -> validate, in that order
[ ] Unit tests (service/business rules, crypto round-trips where applicable)
[ ] Integration tests (route + D1 + DO/Queue + auth + authz, incl. cross-org negative tests)

Frontend
[ ] API client module (no raw fetch() in components)
[ ] Crypto operations routed through packages/crypto only
[ ] List / Create / Detail / Edit views as applicable, in the IDE-shell/log-line visual system
[ ] Loading, empty, error, permission-denied states (per 13-frontend-specification.md §5.7)
[ ] Responsive behavior (desktop/tablet/mobile per §6 of that doc)
[ ] Keyboard-only operability + accessibility floor (§8 of that doc)

Security & quality gates
[ ] No plaintext content anywhere server-side (grep/log audit)
[ ] Cross-org isolation test added and passing for every new resource type
[ ] typecheck, lint, unit, integration tests pass
[ ] No TODO/mock implementations left in the code path
[ ] No console errors; no ciphertext/key material in logs
```

---

## 10. Agent operating rules

1. Read the relevant source doc(s) before modifying architecture, schema, or crypto design.
2. Never invent a requirement when an existing doc defines the behavior — cite which doc/section
   you're following if asked.
3. If two docs conflict, stop and report the conflict instead of picking one.
4. Implement vertically complete features (§9), not isolated UI or isolated API.
5. Keep TypeScript strict; no `any` without explicit justification.
6. Do not duplicate a component/crypto-wrapper/query-helper pattern that already exists —
   extend it.
7. Run typecheck, lint, and tests before declaring a task complete.
8. Every organization-owned query must include `organization_id` — this is the single most
   common way this kind of app gets a cross-tenant bug; treat it as non-negotiable.
9. Never add a code path that lets the server read, index, or search plaintext message/file
   content, and never add a "temporary" server-side key-escrow shortcut — these are permanent
   product guarantees, not conveniences to defer.
10. After completing every phase, mark that phase as done in `todo.md` before moving to the
    next phase.

---

## 11. Task format for delegating work to the coding agent

Use this template per task; keep tasks scoped to one vertical slice where possible.

```
TASK ID:        QYX-XXX
TITLE:
OBJECTIVE:
CONTEXT:
DEPENDENCIES:   (prior task IDs)

BACKEND:
FRONTEND:
CRYPTO:         (client-side operations touched, if any — must route through packages/crypto)
DATABASE:
AUTHORIZATION:  (required role(s) + org-scope check)
API:            (routes touched)
REALTIME:       (DO/WebSocket frames touched, if any)
TESTS:          (incl. cross-org and crypto round-trip cases where relevant)

ACCEPTANCE CRITERIA:
OUT OF SCOPE:
```

Example:

```
TASK ID: QYX-042
TITLE: Implement 1:1 Message Send
OBJECTIVE: Allow two org members to exchange an E2EE text message in realtime.
DEPENDENCIES: QYX-016 (conversations), QYX-017 (ConversationDO), QYX-011 (crypto core)

BACKEND:
- POST /v1/conversations/:id/messages route
- orgScope + membership check before persisting
- Persist ciphertext row to D1; notify ConversationDO via RPC

CRYPTO:
- Client encrypts message body via packages/crypto session API before POST
- Server never receives or logs plaintext

AUTHORIZATION:
Required: authenticated member of conversation_id within their org

FRONTEND:
- Composer submit -> encrypt -> POST -> optimistic log-line append
- WebSocket frame renders incoming message as a log line, not a bubble

TESTS:
- authorized member send succeeds; non-member send is 403
- cross-org conversation_id guess returns ORG_SCOPE_VIOLATION-shaped 404
- tampered ciphertext frame fails AEAD auth on the recipient client
- offline recipient receives ciphertext on reconnect via the offline-delivery queue

ACCEPTANCE CRITERIA:
- Message persisted with correct organization_id and conversation_id
- Online recipient receives it within p95 500ms
- All tests pass

OUT OF SCOPE:
- Read receipts, reactions (separate task)
```

---

## 12. Release gate (before calling anything "production ready")

```
TypeScript compilation             PASS
ESLint                             PASS
Unit / Integration / E2E           PASS
Org-isolation regression suite     PASS
RBAC authorization tests           PASS
Crypto known-answer / fuzz tests   PASS
Security scan (deps + static)      PASS
D1 migrations                      VERIFIED
Backups + restore drill            VERIFIED
Independent crypto/security review PASS  (gates any public E2EE claim — 07-security-design.md §13)
Penetration test findings          REMEDIATED (critical/high)
Wrangler deploy + health checks    PASS
Production smoke test              PASS
```

Product boundary reminder (`01-project-specification-prd.md` §3.2): this is v1 of a
secure organization-internal communications platform, not a public messaging network, not a
video/voice-calling product, and not a content-moderation or server-side-search product.
Cross-organization/guest communication is explicitly deferred (ADR-012) — do not let scope
creep introduce it without a dedicated ADR and security review.