# Software Requirements Specification (SRS)

Conforms loosely to IEEE 830 structure, adapted for an agile/incremental delivery model.

## 1. Introduction

### 1.1 Purpose
Defines functional and non-functional requirements for the secure organization-centric messaging platform, derived from the Project Specification/PRD.

### 1.2 Scope
Covers identity, organization management, authentication, RBAC, messaging (1:1, group, broadcast), file sharing, E2EE, device management, admin/security tooling, and auditing, as implemented on the specified Cloudflare-based stack.

### 1.3 Definitions

| Term | Definition |
|---|---|
| E2EE | End-to-end encryption — only sender and intended recipient(s) can read plaintext |
| Org | Organization — top-level tenant boundary |
| RBAC | Role-Based Access Control |
| Ciphertext | Encrypted message/file content stored server-side |
| DO | Durable Object (Cloudflare) |
| SSO | Single Sign-On |

---

## 2. Overall Description

### 2.1 Product Perspective
A multi-tenant SaaS communications platform. Frontend: React SPA. Backend: Hono on Cloudflare Workers. Persistent relational data: D1. Realtime fan-out: Durable Objects + WebSockets. Blobs: R2. Async work: Queues. Hot state/session cache: KV.

### 2.2 User Classes
Super Admin, Admin, Manager (future), Security Admin (future), Employee — see PRD §4.

### 2.3 Operating Environment
Web (React SPA via Cloudflare Pages), with architecture designed to extend to native iOS/Android clients. All server compute at Cloudflare edge; no persistent server processes.

### 2.4 Design & Implementation Constraints
- No custom cryptography (FR-SEC series enforces use of established primitives only).
- Every persisted object must carry `organization_id`; enforcement server-side, not UI-side.
- No physical deletion of user identities in normal operation.
- Server must never possess keys capable of decrypting message content.

---

## 3. Functional Requirements

Requirement ID format: `FR-<AREA>-<NUM>`. Priority: **M**ust, **S**hould, **C**ould (MoSCoW).

### 3.1 Identity & Organization (FR-ORG)

| ID | Requirement | Priority |
|---|---|---|
| FR-ORG-01 | System shall assign every user an immutable internal ID (`usr_...`) distinct from email. | M |
| FR-ORG-02 | Email shall be unique within an organization and serve as the primary registration attribute. | M |
| FR-ORG-03 | Changing a user's email shall not alter their internal ID or cryptographic identity. | M |
| FR-ORG-04 | Every core domain object (user, message, conversation, group, channel, file, audit event) shall carry an `organization_id`. | M |
| FR-ORG-05 | The system shall reject any request where the authenticated user's `organization_id` does not match the target object's `organization_id`, regardless of client input. | M |
| FR-ORG-06 | Organization creation shall require domain verification via a DNS TXT record before the domain is trusted. | M |
| FR-ORG-07 | Users may only be added to an organization if their email domain is on that organization's verified allow-list. | M |
| FR-ORG-08 | Cross-organization search/discovery/messaging shall be disabled by default. | M |
| FR-ORG-09 | User status shall follow Active → Suspended → Deactivated; deactivation shall not delete message, audit, membership, or encryption-metadata records. | M |

### 3.2 Authentication & Devices (FR-AUTH)

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-01 | System shall support password + MFA (TOTP) authentication. | M |
| FR-AUTH-02 | System shall support WebAuthn/passkey authentication. | S |
| FR-AUTH-03 | System shall support organization SSO (Entra ID, Google Workspace, Okta) via OIDC/SAML. | S |
| FR-AUTH-04 | MFA shall be mandatory for Super Admin and Admin roles. | M |
| FR-AUTH-05 | Each login shall result in device registration or re-authentication of an existing device. | M |
| FR-AUTH-06 | Users shall be able to view and revoke their own active devices/sessions. | M |
| FR-AUTH-07 | Admins shall be able to view (not decrypt) and revoke devices/sessions within their organization. | M |
| FR-AUTH-08 | New device authorization shall require approval from an existing trusted device or a configured recovery mechanism. | M |
| FR-AUTH-09 | Users shall be able to verify another user's identity via QR code / security number / cryptographic fingerprint comparison. | S |

### 3.3 RBAC (FR-RBAC)

| ID | Requirement | Priority |
|---|---|---|
| FR-RBAC-01 | System shall enforce roles: Super Admin, Admin, Employee (v1); Manager, Security Admin (phase 2). | M |
| FR-RBAC-02 | Only Super Admin may create/delete organizations. | M |
| FR-RBAC-03 | Admins may add/remove/suspend users, manage groups/channels, and approve membership requests within their own org. | M |
| FR-RBAC-04 | Employees may not manage users, groups, or channels beyond their own membership requests. | M |
| FR-RBAC-05 | All authorization checks shall be enforced server-side on every API call, independent of client-supplied role claims. | M |

### 3.4 Messaging (FR-MSG)

| ID | Requirement | Priority |
|---|---|---|
| FR-MSG-01 | Users shall be able to initiate 1:1 conversations with other users in the same organization. | M |
| FR-MSG-02 | System shall support message types: text, emoji/reaction, image, audio, video, and approved document formats. | M |
| FR-MSG-03 | All message content shall be encrypted client-side before transmission; server shall store ciphertext only. | M |
| FR-MSG-04 | System shall deliver messages in realtime to online recipients via WebSocket. | M |
| FR-MSG-05 | System shall queue and push-notify (generic payload) messages for offline recipients, delivering ciphertext on reconnect. | M |
| FR-MSG-06 | Messages shall support reply-to references, delivery/read status, and reactions. | S |
| FR-MSG-07 | Push notification payloads shall not contain message plaintext by default (configurable to include preview per org policy). | M |

### 3.5 Groups & Channels (FR-GRP)

| ID | Requirement | Priority |
|---|---|---|
| FR-GRP-01 | Admins/authorized roles shall be able to create/delete groups and broadcast channels. | M |
| FR-GRP-02 | Employees shall be able to request membership in groups/channels; admins approve or reject. | M |
| FR-GRP-03 | Approval shall trigger provisioning of group encryption key material to the new member's devices. | M |
| FR-GRP-04 | Removal of a member from a group shall cryptographically prevent that member from decrypting subsequently sent messages. | M |
| FR-GRP-05 | Broadcast channels shall restrict posting to authorized roles; employees may read/react/acknowledge only. | M |

### 3.6 Files (FR-FILE)

| ID | Requirement | Priority |
|---|---|---|
| FR-FILE-01 | Files shall be encrypted client-side prior to upload; server shall store only encrypted blobs plus non-sensitive metadata. | M |
| FR-FILE-02 | Organizations shall be able to configure allowed file types and maximum file size. | M |
| FR-FILE-03 | Organizations shall be able to disable external sharing of files. | S |
| FR-FILE-04 | System shall reject upload of blocked file types (executables, unknown binaries, scripts) per policy. | M |

### 3.7 Administration & Audit (FR-ADM)

| ID | Requirement | Priority |
|---|---|---|
| FR-ADM-01 | Admin dashboard shall expose members, groups, channels, requests, communications, security, and org settings. | M |
| FR-ADM-02 | Security Center shall display MFA adoption %, verified device %, suspended accounts, active sessions, and unrecognized devices — without exposing message content. | M |
| FR-ADM-03 | System shall record audit events for security/administrative actions (user added/removed, role changed, group/channel created/deleted, device registered/revoked, login, MFA change, policy change). | M |
| FR-ADM-04 | Audit events shall never contain message plaintext or ciphertext content. | M |

### 3.8 Search (FR-SRCH)

| ID | Requirement | Priority |
|---|---|---|
| FR-SRCH-01 | Message search shall be performed via a locally maintained, decrypted index on the user's device; server shall not provide plaintext search. | M |
| FR-SRCH-02 | Member/org directory search (non-content) may be performed server-side. | S |

---

## 4. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Security | No server-side plaintext of message content or file content at any layer, at rest or in transit. |
| NFR-02 | Security | Only established, peer-reviewed cryptographic protocols/libraries may be used; no proprietary algorithms. |
| NFR-03 | Security | Organization isolation must be enforced at DB, API, authorization, storage, and encryption layers. |
| NFR-04 | Availability | Realtime message delivery service target: 99.9% monthly uptime. |
| NFR-05 | Performance | p95 message delivery latency to an online recipient < 500ms. |
| NFR-06 | Performance | p95 API response time (non-message-send) < 300ms at edge. |
| NFR-07 | Scalability | Architecture shall support horizontal scaling per organization via edge compute (Workers) and sharded Durable Objects per conversation/group. |
| NFR-08 | Privacy | Metadata retention shall be minimized to what is operationally necessary (see Security Design doc). |
| NFR-09 | Compliance | Audit logs must be tamper-evident and retained per configurable organization retention policy. |
| NFR-10 | Usability | Employee-facing UI shall not require the user to understand cryptographic concepts to use core features. |
| NFR-11 | Portability | Client-server API shall be documented (OpenAPI/REST) to support future native mobile clients. |
| NFR-12 | Maintainability | Backend logically separated into Identity, Organization, Messaging, Group, Channel, and File services even if co-deployed. |
| NFR-13 | Testability | Critical crypto and authorization logic shall have automated test coverage (unit + integration) prior to release. |
| NFR-14 | Observability | All services shall emit structured logs and error telemetry (Sentry) without leaking plaintext content. |

---

## 5. External Interface Requirements

- **User interfaces:** React + TypeScript + Vite SPA, Tailwind + shadcn/ui, responsive web; architecture supports future native apps.
- **APIs:** REST, validated with Zod, versioned, documented via OpenAPI.
- **Hardware interfaces:** None beyond standard client device (WebAuthn-capable for passkeys).
- **Communication interfaces:** HTTPS/TLS 1.3 for REST; WSS for realtime; Resend for transactional email (verification, invites, alerts).

## 6. Traceability

Each FR/NFR in this document maps to sections of the System Architecture (HLD), LLD, Database Design, API Spec, and Security Design documents. A full traceability matrix should be maintained in the project management tool (e.g., linked issues) referencing these IDs.
