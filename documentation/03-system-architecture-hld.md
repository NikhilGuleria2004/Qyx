# System Architecture / High-Level Design (HLD)

## 1. Purpose

Describes the major components of the platform, their responsibilities, and how they interact, on the Cloudflare-native stack:

```
Frontend : React + TypeScript + Vite, Tailwind + shadcn/ui, Zustand
Backend  : TypeScript + Hono on Cloudflare Workers
Realtime : Durable Objects + WebSockets
Database : Cloudflare D1
Storage  : Cloudflare R2 (encrypted blobs)
Queue    : Cloudflare Queues
Cache    : Cloudflare KV
Auth     : Workers-based auth, RBAC
E2EE     : Web Crypto API + established protocol (Signal-style)
```

---

## 2. Architectural Principles

1. **Ciphertext-only server.** The server (Workers, D1, R2, DOs) never holds keys capable of decrypting message or file content.
2. **Organization isolation everywhere.** `organization_id` is enforced at DB query level, API middleware level, and encryption/key-scoping level — never only in the UI.
3. **Edge-first, stateless compute.** Workers are stateless request handlers; all durable state lives in D1 (relational), R2 (blobs), KV (cache/session), or Durable Objects (realtime/conversation state).
4. **Logical service separation** within a single deployable Workers project (or multiple Workers services), mirroring: Identity, Organization, Messaging, Group, Channel, File.
5. **No invented cryptography.** Only Web Crypto API primitives and reviewed protocol design (X25519/Ed25519, AES-256-GCM/ChaCha20-Poly1305, HKDF, double-ratchet-style session management).

---

## 3. High-Level Component Diagram

```
                        CLIENTS
        ┌────────────────┼────────────────┐
        │                │                │
       Web (React/Vite) iOS (future)   Android (future)
        │                │                │
        └────────────────┼────────────────┘
                          │  HTTPS / WSS
                 Cloudflare Pages (static) + API Gateway (Workers)
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                      │
  Auth/Identity      Messaging/Group/Channel   File Service
  Worker(s)          Worker(s) + Durable        Worker(s)
        │             Objects (per-conversation)     │
        │                 │                      │
        └─────────────────┼──────────────────────┘
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                      │
      D1 (relational)  R2 (encrypted blobs)   KV (cache/session)
                          │
                    Cloudflare Queues
                          │
                 Notification Worker (push/email via Resend)
```

---

## 4. Component Responsibilities

### 4.1 Frontend (React + Vite)
- Renders UI, manages local application state (Zustand), performs **all cryptographic encryption/decryption client-side** via Web Crypto API.
- Maintains local decrypted search index (IndexedDB) — never uploaded.
- Establishes WebSocket connection to Realtime Gateway for live message delivery.
- Manages device key material in secure browser storage (and OS keystore on native clients, future).

### 4.2 API Gateway (Cloudflare Workers + Hono)
- Single entry point for REST calls; terminates TLS, applies rate limiting (KV-backed), request validation (Zod), and routes to logical services.
- Injects authenticated identity (`user_id`, `organization_id`, `role`) into every downstream call from a verified session/JWT — this is the enforcement point for FR-ORG-05.

### 4.3 Identity Service (Workers)
- Registration, login, MFA, passkeys, SSO (OIDC/SAML) callbacks.
- Issues session tokens; manages device registration and device authorization flow.
- Owns `users`, `devices`, `sessions` tables in D1.

### 4.4 Organization Service (Workers)
- Organization creation, domain verification (DNS TXT challenge/response), org settings, file/security policy configuration.
- Owns `organizations`, `domains` tables.

### 4.5 Messaging Service (Workers + Durable Objects)
- One Durable Object instance per conversation/group/channel acts as the authoritative realtime coordinator: holds connected WebSocket clients, sequences message ordering, fans out ciphertext to online members, and persists ciphertext to D1 via the Worker.
- Handles read receipts, reactions, replies, delivery status.
- Offline delivery: message ciphertext persisted, event pushed onto Cloudflare Queues → Notification Worker → generic push notification.

### 4.6 Group Service (Workers)
- Group CRUD, membership request/approval workflow, membership role management.
- On approval/removal, triggers the client-driven group key rotation flow (server relays encrypted key-distribution messages; it does not generate or see plaintext keys).

### 4.7 Channel Service (Workers)
- Broadcast channel CRUD, subscriber management, posting-permission enforcement (only authorized roles may post; others read/react/acknowledge).

### 4.8 File Service (Workers + R2)
- Issues pre-signed upload/download URLs for R2 after client-side encryption.
- Enforces org file policy (allowed types, size limits) on metadata (mime type, size) — cannot inspect encrypted content.
- Coordinates any client-side/pre-encryption malware scanning workflow if enabled by policy.

### 4.9 Notification Worker
- Consumes Cloudflare Queues events; sends push notifications (generic, content-free by default) and transactional email via Resend (verification, invites, security alerts).

### 4.10 Audit/Security Worker
- Records security/administrative audit events (never content) into D1; powers the Security Center dashboard aggregate metrics.

---

## 5. Data Stores

| Store | Used for |
|---|---|
| **D1** | Relational data: organizations, domains, users, devices, conversations, messages (ciphertext + metadata), groups, channels, memberships, audit_events, file metadata |
| **R2** | Encrypted file/media blobs |
| **KV** | Session/token cache, rate-limit counters, ephemeral device-pairing codes |
| **Durable Objects** | Per-conversation/group/channel realtime coordination state (connected sockets, sequence numbers) |
| **Queues** | Async fan-out: offline notification delivery, audit event batching, email dispatch |

---

## 6. Key Interaction Flows (Summary — see LLD for detail)

1. **Send 1:1 message:** Client encrypts → POST to Messaging Worker → Worker authorizes (org/conversation membership) → writes ciphertext to D1 → notifies conversation Durable Object → DO pushes to recipient's live WebSocket, or enqueues push notification if offline.
2. **Join group:** Employee requests → Admin approves via Group Service → server relays client-generated encrypted key-distribution payload to new member's registered devices → member's client derives group key locally.
3. **Cross-org request:** API Gateway middleware compares session `organization_id` to the target resource's `organization_id` at the D1 query layer (every query is scoped with `WHERE organization_id = ?`); mismatch → 403, audited.
4. **File upload:** Client encrypts file → File Service validates policy on metadata → issues R2 pre-signed URL → client uploads ciphertext directly to R2 → File Service records reference in D1.

---

## 7. Deployment Topology

- **Cloudflare Pages**: hosts the built React SPA (static assets, CDN-distributed globally).
- **Cloudflare Workers**: all backend logic, deployed via Wrangler, environment-separated (dev/staging/prod).
- **D1**: one logical database per environment; schema migrations versioned in repo.
- **R2 buckets**: separated per environment; optionally per-org prefixing for operational clarity (not a security boundary by itself — access control is enforced in the Worker layer).
- **Durable Objects**: namespace bound per Worker service (e.g., `CONVERSATION_DO`, `GROUP_DO`).

See **Infrastructure Design** document for full environment/network detail.

## 8. Non-Functional Architecture Notes

- **Scalability:** Workers scale automatically per-request at the edge; Durable Objects provide natural sharding by conversation/group ID, avoiding a single realtime bottleneck.
- **Resilience:** Queues provide retry/backoff for notification delivery; D1 writes are the durability boundary for message ciphertext (DO state is coordination-only, not the source of truth).
- **Security boundary enforcement:** Organization isolation is implemented redundantly — API middleware, D1 query scoping, and R2 key-prefix scoping — so a bug in any one layer does not by itself create a cross-org leak.
