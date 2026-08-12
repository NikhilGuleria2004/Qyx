# Project Specification / Product Requirements Document (PRD)

## 1. Document Purpose

This document defines **what is being built**: the product vision, target users, scope, features, and success criteria for the secure, organization-centric enterprise communications platform. It is the source of truth for product intent and is the parent document for the SRS, HLD/LLD, and all downstream engineering specs.

---

## 2. Product Summary

A secure, organization-centric communications platform that provides private one-to-one messaging, encrypted group communication, and controlled broadcast communication for employees, managers, HR, and administrators.

Every user is tied to a verified organizational identity. Role-based access control (RBAC) determines what a user can access and manage. All supported communication — text, audio, video, images, and documents — is protected through end-to-end encryption (E2EE). Encrypted files, device-level cryptographic identities, secure authentication, strict organization isolation, and comprehensive security auditing form the foundation of the platform.

**Positioning statement:**

> Not "Slack but encrypted." The differentiator is the combination of **Identity + Organization + Access Control + E2EE + Enterprise Administration** — a platform where the company controls who belongs to the organization and what they're allowed to do, while communication content itself remains private between authorized participants only.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Provide organizations with a private, isolated communication space for their employees.
- Guarantee that Organization A can never discover, message, or access data belonging to Organization B.
- Provide end-to-end encrypted 1:1 messaging, group messaging, and broadcast channels.
- Support rich content: text, images, audio, video, and common office file formats (PDF, DOCX, XLSX, PPTX).
- Provide enterprise-grade identity, authentication (MFA, SSO, passkeys), and RBAC.
- Provide administrators with visibility into security posture without ever exposing message plaintext.
- Support multi-device usage with secure key synchronization.
- Be architecture-first about privacy: minimize metadata retention, avoid inventing cryptography, and require independent security review before any "zero-knowledge"/"full E2EE" claim is made publicly.

### 3.2 Non-Goals (v1)

- Cross-organization ("external"/"guest") communication — explicitly disabled by default; may become a future phase with its own security policy tier.
- Public/consumer messaging network features (public profiles, discoverability outside an org, open sign-up).
- Server-side plaintext search or server-side content moderation on E2EE content (conflicts with the encryption model; addressed via client-side approaches only).
- Video/audio calling infrastructure (may be a future phase; v1 covers file-based audio/video messages, not live calls, unless explicitly greenlit).
- Custom/home-grown cryptography of any kind.

---

## 4. Target Users / Personas

| Persona | Description | Primary Needs |
|---|---|---|
| **Super Admin** | Platform-level org owner (e.g., IT/security leadership) | Create org, verify domain, configure security policy, manage admins |
| **Admin** (HR / IT / Security) | Operates inside an existing org | Manage members, groups, channels, approve requests |
| **Manager** | Team lead | Limited member management, group/channel creation for their team |
| **Employee** | Standard user | 1:1 chat, join groups/channels, share files, receive broadcasts |
| **Security Admin** *(future role split)* | Focused on security posture | Manage devices, MFA, audit, security policy |

---

## 5. Core Use Cases

1. **Organization onboarding** — A company registers, verifies domain ownership via DNS TXT record, and becomes a trusted organization.
2. **Employee onboarding** — Employee is invited or self-registers with a verified organizational email, completes MFA/device registration, and lands on their home screen.
3. **1:1 secure messaging** — Two employees within the same org exchange E2EE messages, files, and reactions in real time.
4. **Group collaboration** — A team (e.g., Engineering) communicates in a private encrypted group with membership-driven key management.
5. **Broadcast communication** — HR/Management post to a channel (e.g., Company Announcements); employees read/react/acknowledge but cannot post.
6. **Membership requests** — Employees request to join a group/channel; an admin approves or rejects.
7. **Device management** — A user adds a new device (phone, laptop, tablet), authorizes it via an existing trusted device, and synchronizes encrypted history.
8. **Offboarding** — HR deactivates a departing employee; the identity is preserved (not deleted) for audit/compliance/history integrity, and future group message decryption is cryptographically revoked.
9. **Security review** — An admin reviews the Security Center (MFA adoption, verified devices, active sessions, suspicious devices) without ever seeing message content.
10. **File sharing under policy** — An employee shares a DOCX; the org's file policy (allowed types, max size, external sharing) is enforced, and the file is encrypted client-side before upload.

---

## 6. Feature Scope (v1)

### 6.1 Identity & Organization
- Email-based organizational identity with immutable internal user ID.
- Organization as the fundamental security boundary (enforced at DB, API, authZ, storage, and encryption layers).
- Domain allow-listing with DNS-based domain verification.
- User lifecycle: Active → Suspended → Deactivated (no hard deletes in normal operation).

### 6.2 Authentication & Devices
- Password + MFA (TOTP), email verification, passkeys/WebAuthn.
- Organization SSO (Entra ID, Google Workspace, Okta) — phased rollout, SSO prioritized for larger orgs.
- Device registration and device-level cryptographic identity; device verification (QR/security number/fingerprint comparison).
- Device authorization flow for new devices via an existing trusted device.

### 6.3 Messaging
- 1:1 conversations, private groups, org/department broadcast channels.
- Rich content: text, emoji/reactions, images, audio, video, PDF, DOCX, XLSX, PPTX, ZIP, and other org-approved file types.
- Read receipts, delivery status, replies, reactions.
- Realtime delivery via WebSocket; offline delivery via encrypted storage + push notification (generic payload, no content leak).

### 6.4 Groups & Channels
- Groups: two-way communication, admin/manager-managed membership.
- Channels: broadcast (one-to-many), posting restricted to authorized roles, employees can read/react/acknowledge.
- Membership request → pending → approve/reject workflow; approval triggers cryptographic key provisioning.

### 6.5 Administration
- RBAC: Super Admin, Admin, Manager (future split), Employee, Security Admin (future split).
- Admin dashboard: members, groups, channels, requests, communications, security, audit, org settings.
- Security Center: MFA adoption %, verified device %, suspended accounts, active sessions, unrecognized devices.
- File policy configuration (allowed types, max size, external sharing toggle).
- Audit log of security/administrative events (not message content).

### 6.6 Encryption
- Client-side E2EE for all message content and file attachments.
- Established protocol only (Signal-style double ratchet, X25519/Ed25519, AES-256-GCM or ChaCha20-Poly1305, HKDF) — no custom cryptography.
- Group encryption with cryptographic consequences for membership changes (member removal revokes future decryption).
- Local, on-device search index (no server-side plaintext search).
- Secure, policy-driven account/key recovery (enterprise recovery key, device-based recovery) — never silent server-side plaintext recovery.

---

## 7. Success Metrics

| Metric | Target (v1) |
|---|---|
| Cross-org data leakage incidents | 0 (hard requirement) |
| MFA adoption among admins | 100% (mandatory) |
| MFA adoption among employees | Org-configurable, tracked in Security Center |
| Message delivery latency (online recipient) | < 500ms p95 |
| E2EE coverage of message/file content | 100% of supported content types |
| Independent security review completed before public E2EE claims | Required, gating |

---

## 8. Constraints & Assumptions

- Runtime is Cloudflare Workers (edge-first, stateless compute); realtime state lives in Durable Objects.
- No server-side plaintext storage of message content under any circumstance.
- Malware/virus scanning of E2EE file attachments requires a specifically designed approach (client-side scanning or pre-encryption trusted scanning) since the server cannot see plaintext.
- SSO, advanced recovery, and role granularity (Manager/Security Admin split) may be phased rather than v1-day-one.

## 9. Open Questions

- Which recovery policy is default for new organizations (device-only vs. enterprise recovery key)?
- Will video/voice calling be a fast-follow phase?
- What is the minimum viable external/guest communication model, if any, post-v1?
- Exact malware-scanning approach for encrypted attachments (client-side scan before encrypt vs. none in v1)?
