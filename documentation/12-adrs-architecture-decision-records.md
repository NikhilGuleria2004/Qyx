# Architecture Decision Records (ADRs)

Each record captures: **Context → Decision → Consequences → Alternatives considered.** Status values: Proposed, Accepted, Superseded.

---

## ADR-001: Use Internal Immutable User IDs Separate from Email

**Status:** Accepted

**Context:** Email is the natural registration/identity attribute in an enterprise product, but emails can change (e.g., name changes, domain migrations), and E2EE identity should not be disrupted by that.

**Decision:** Every user gets an immutable internal ID (`usr_...`) as the true database/cryptographic identity key. Email is a mutable, org-unique attribute tied to that ID, not the primary key.

**Consequences:** Slightly more complex identity model (two identifiers to reason about); but email changes never invalidate cryptographic identity or historical message/audit references.

**Alternatives considered:** Using email as primary key directly — rejected because it would force re-establishing cryptographic identity on every email change, breaking E2EE continuity.

---

## ADR-002: Organization as a Hard Multi-Layer Security Boundary

**Status:** Accepted

**Context:** The product's core promise is that Organization A can never access Organization B's data. A single-layer control (e.g., only API-level checks) is fragile against bugs.

**Decision:** Enforce organization isolation redundantly at four layers: API/session derivation, database query scoping (mandatory `organization_id` in every query), RBAC evaluation, and storage/encryption namespacing.

**Consequences:** More boilerplate per query/endpoint; mitigated by shared query-helper conventions and lint rules. Significantly reduces blast radius of any single-layer bug.

**Alternatives considered:** Separate database per organization (true physical isolation) — rejected for v1 due to operational complexity at scale on D1/Workers; revisit if a specific enterprise customer's compliance requirements demand physical isolation.

---

## ADR-003: No Custom Cryptography — Established Primitives Only

**Status:** Accepted

**Context:** E2EE is the product's central differentiator and central risk. Home-grown cryptography is a leading cause of real-world messaging-product breaches.

**Decision:** Use only established, reviewed primitives (X25519, Ed25519, AES-256-GCM/ChaCha20-Poly1305, HKDF) and a Signal-style double-ratchet-derived protocol design, implemented via the Web Crypto API. No proprietary algorithms at any layer.

**Consequences:** Slower initial development (must integrate/adapt established protocol designs rather than inventing shortcuts); requires eventual independent cryptographic review before production/public claims. Strongly reduces risk of catastrophic, hard-to-detect crypto flaws.

**Alternatives considered:** Simpler custom scheme "for v1, harden later" — explicitly rejected; the risk of a launch-time crypto flaw becoming load-bearing for customer trust is unacceptable.

---

## ADR-004: Cloudflare-Native Stack (Workers/D1/R2/DO/Queues/KV) for Backend

**Status:** Accepted

**Context:** Need an edge-first, low-latency, globally distributed backend without managing traditional server fleets, and a realtime primitive that naturally shards per-conversation.

**Decision:** Adopt Cloudflare Workers (compute), D1 (relational), R2 (blob storage), Durable Objects (realtime coordination/state), Queues (async), KV (cache/session), all under one provider, deployed via Wrangler.

**Consequences:** Strong latency/scaling characteristics and operational simplicity (single provider, unified IaC via `wrangler.toml`). Introduces platform lock-in to Cloudflare's specific primitives (e.g., DO semantics, D1's SQLite dialect) — accepted trade-off given the architectural fit, revisit only if a specific limitation (e.g., DO connection ceilings for very large broadcast channels) becomes a hard blocker.

**Alternatives considered:** Traditional container-based backend (e.g., Node services on Kubernetes/ECS) with a managed Postgres — rejected: higher operational overhead, no equivalent to Durable Objects' natural per-conversation sharding, worse cold-start/latency profile at the edge.

---

## ADR-005: Durable Objects as the Realtime Coordination Primitive (One DO per Conversation/Group/Channel)

**Status:** Accepted

**Context:** Realtime message fan-out needs strict per-conversation ordering and low-latency delivery to connected clients, without a centralized realtime server becoming a bottleneck or single point of contention across all conversations.

**Decision:** Shard realtime state by conversation/group/channel ID, one Durable Object instance per ID (`ConversationDO`, `ChannelDO`), holding connected WebSocket registrations and sequencing.

**Consequences:** Natural horizontal scaling and isolation of "hot" conversations from each other. Known checkpoint: very large broadcast channels (many thousands of subscribers) may need a sub-sharding pattern later (tracked in Infrastructure Design §6) — not a v1 blocker given expected enterprise channel sizes.

**Alternatives considered:** Centralized pub/sub (e.g., a single fan-out service) — rejected due to weaker natural sharding and higher operational complexity to achieve equivalent per-conversation ordering guarantees.

---

## ADR-006: Ciphertext-Only Server — No Server-Side Plaintext Search

**Status:** Accepted

**Context:** True E2EE means the server cannot read message content, which conflicts with conventional server-side full-text search.

**Decision:** Search happens entirely client-side against a locally maintained, decrypted index (IndexedDB-backed); the server never indexes or searches plaintext.

**Consequences:** No cross-device search without first syncing/decrypting history on each device; local index must be rebuilt per device. This is treated as an acceptable, explicit trade-off of genuine E2EE rather than a gap to "fix" with server-side indexing later.

**Alternatives considered:** Searchable encryption schemes (e.g., encrypted index structures queryable by the server) — deferred; adds significant cryptographic complexity and its own metadata-leakage risks, revisit post-v1 only with dedicated cryptographic review.

---

## ADR-007: Status-Driven User Lifecycle (No Hard Deletes)

**Status:** Accepted

**Context:** Deleting a user's identity outright would cascade-break message references, audit records, group history, and compliance records.

**Decision:** Users move through Active → Suspended → Deactivated; the UI may present this as "Remove employee," but the backend never hard-deletes the identity row or its historical references. Anonymization of PII fields is handled separately per org retention policy, decoupled from identity/reference integrity.

**Consequences:** Requires careful retention-policy design for genuine "right to be forgotten"-style requests (handled via field-level anonymization, not row deletion). Preserves message/audit/group history integrity.

**Alternatives considered:** Hard delete with cascading cleanup — rejected due to compliance/audit-integrity risk and the cryptographic complexity of retroactively invalidating history correctly.

---

## ADR-008: Domain-Verified Organization Membership (DNS TXT Challenge)

**Status:** Accepted

**Context:** Allowing self-declared "I represent @acme.com" claims at org-creation time would let anyone impersonate a company and potentially harvest employees' attempted logins.

**Decision:** Organization domain claims require DNS TXT record verification before the domain becomes trusted and before users under that domain can be auto-admitted.

**Consequences:** Adds friction to org onboarding (DNS access required); prevents domain-spoofing/impersonation of organizations at the trust root of the whole isolation model.

**Alternatives considered:** Email-based domain verification only (e.g., verify one admin's email) — rejected as weaker; DNS TXT proves control of the domain itself, not just one mailbox on it.

---

## ADR-009: Generic-Content Push Notifications by Default

**Status:** Accepted

**Context:** Push notification payloads pass through third-party push services (APNs/FCM-equivalent infra); including message content there would leak confidential information outside the E2EE boundary.

**Decision:** Default push payload is content-free ("New message from X"); message-preview notifications are an explicit, auditable, org-level opt-in, off by default.

**Consequences:** Slightly less convenient UX by default (no preview) in exchange for closing an otherwise-easy confidentiality leak. Sensitive orgs are never silently opted into previews.

**Alternatives considered:** Always include a short preview (common in consumer messaging apps) — rejected as inconsistent with the platform's enterprise security positioning.

---

## ADR-010: Decoupled Password Reset and Key Recovery

**Status:** Accepted

**Context:** A common anti-pattern in "E2EE" products is a password-reset flow that quietly also recovers/re-derives message-decryption keys server-side, silently defeating the E2EE guarantee.

**Decision:** Authentication credential recovery (password reset) is fully decoupled from cryptographic key recovery. Key recovery is a separate, explicit, org-policy-driven mechanism (device-approval default, enterprise recovery key, or user-controlled backup), never a side effect of password reset.

**Consequences:** Users who lose both their password and their only device under the default policy may permanently lose access to historical encrypted content unless the org has enabled an enterprise/user recovery mechanism — this is treated as a deliberate, documented consequence of genuine E2EE, not a bug to "fix" via server-side escrow.

**Alternatives considered:** Server-side key escrow tied to account recovery for convenience — explicitly rejected as incompatible with the product's E2EE guarantee.

---

## ADR-011: No Public "Zero-Knowledge" Claims Prior to Independent Review

**Status:** Accepted

**Context:** Marketing/product pressure to claim "full E2EE" or "zero-knowledge" is high, but the actual guarantee depends on protocol correctness, key management, recovery design, group membership handling, file handling, and metadata model — none of which are self-certifying.

**Decision:** The organization will not make public zero-knowledge/full-E2EE claims until independent cryptographic review and penetration testing have been completed and findings remediated (tracked as a formal pre-production gate in the Security Design document).

**Consequences:** Slower go-to-market messaging on the security differentiator; protects against reputational/legal risk of an unsubstantiated security claim later found false.

**Alternatives considered:** Ship marketing claims ahead of review "since the architecture is designed for it" — rejected as misrepresentation risk.

---

## ADR-012 (Deferred): Cross-Organization / External / Guest Communication Model

**Status:** Proposed (not yet accepted — deferred beyond v1)

**Context:** Some future customers may want controlled external communication (e.g., vendor collaboration), but the v1 product's trust model is built entirely around hard org isolation.

**Decision (tentative):** If pursued, external/guest communication will be introduced as an explicitly separate policy tier (Internal / External / Guest) with its own security policy set, never as a loosening of the default internal isolation guarantee.

**Consequences:** Deferring this avoids weakening the core v1 trust model under early feature pressure; revisit with a dedicated ADR and security review when there is concrete customer demand.

**Alternatives considered:** Build a lightweight cross-org allow-list into v1 — rejected for v1 to keep the isolation guarantee simple and easy to reason about/verify.
