# Security Design

## 1. Purpose

Describes how the system is protected: the E2EE model, key management, organization isolation, authentication hardening, metadata minimization, file security, and audit design.

**Important caveat (carried from architecture review):** No public claim of "zero-knowledge" or "full E2EE" should be made until the exact protocol, key management, multi-device sync, recovery, group membership handling, file handling, and metadata model have been independently reviewed by qualified cryptographers/security engineers, and penetration testing has been performed. This document describes the intended design, not a certified guarantee.

## 2. Threat Model (summary)

| Threat | Mitigation |
|---|---|
| Server compromise exposing message content | E2EE — server only ever stores/routes ciphertext |
| Cross-tenant data leakage | Organization isolation enforced at DB, API, authZ, storage, and encryption layers redundantly |
| Credential stuffing / weak auth | MFA (mandatory for admins), passkeys, SSO, rate limiting |
| Device theft/loss | Device-level keys, remote device revocation, key rotation on removal |
| Man-in-the-middle key substitution | User-facing device/identity verification (QR/fingerprint comparison) |
| Malicious/careless file uploads | Org file-type/size policy, no plaintext ever touches server, client-side scanning path for malware where enabled |
| Metadata-based inference (who talks to whom, when) | Explicit metadata minimization policy (§6) |
| Insider (platform operator) snooping | No server-held decryption keys; audit logs contain no content; least-privilege admin tooling |
| Silent weakening of E2EE via "convenient" recovery | Recovery mechanisms are explicit, policy-gated, and audited — never a hidden server-side plaintext-key path |

## 3. Cryptographic Architecture

**Non-negotiable rule: no custom cryptography.** All primitives come from established, reviewed protocols/libraries, implemented via the Web Crypto API (browser) and vetted libraries.

| Purpose | Primitive |
|---|---|
| Key agreement | X25519 |
| Signing / identity keys | Ed25519 |
| Symmetric message/file encryption | AES-256-GCM or ChaCha20-Poly1305 (AEAD) |
| Key derivation | HKDF |
| Session ratcheting (1:1) | Double-ratchet–style protocol (Signal-derived design) |
| Group key management | Sender-keys / group-ratchet approach with explicit rotation on membership change |
| Random generation | `crypto.getRandomValues` (CSPRNG), never `Math.random` |

**Conceptual data flow:**
```
Sender Device --encrypt--> Ciphertext --> SERVER (store/route only) --> Ciphertext --> Recipient Device --decrypt--> Plaintext
```
The server component set (Workers, D1, R2, Durable Objects) is architected to never receive or derive plaintext content or content-decryption keys.

## 4. Identity & Device Security

- Every user has a long-term identity key pair; every **device** additionally has its own device key pair (per HLD/LLD).
- New devices are authorized either by an existing trusted device (preferred) or org-configured recovery policy — never silently trusted.
- Users can view and verify another user's identity via QR code / security number / cryptographic fingerprint comparison, guarding against key-substitution MITM attacks.
- Admins can see and revoke devices/sessions within their org but **cannot** see key material or content — device visibility is metadata-only (device name, platform, last seen, status).

## 5. Organization Isolation (defense in depth)

Enforced redundantly at four layers so a single-layer bug cannot cause a cross-tenant leak:

1. **API layer:** every authenticated request carries a server-derived `organization_id`; client-supplied org IDs are never trusted for authorization decisions.
2. **Database layer:** every query on tenant-owned tables includes `WHERE organization_id = ?`; enforced by convention + lint rule (see Database Design §6) and code review.
3. **Authorization layer (RBAC):** role checks are always evaluated within the resolved organization context.
4. **Storage/encryption layer:** R2 object keys are namespaced by `organization_id`; even if a URL were guessed, encrypted content remains unreadable without the recipient's private key, which was never shared cross-org.

## 6. Metadata Minimization

Even with perfect E2EE, communication patterns (who/when/how-often) can leak sensitive information. The platform explicitly limits what server-side metadata is retained:

**Retained (operationally necessary):**
- Sender/recipient IDs, timestamp, message size class, group membership, delivery status.
- Device platform/name, login history (auth events), IP address at login (for security alerting), session lifecycle.

**Explicitly minimized/not retained:**
- No message content, no file content, no plaintext search index server-side.
- No fine-grained behavioral analytics beyond what security monitoring requires.
- IP addresses retained only for the duration required by the org's security/audit retention policy, not indefinitely by default.

## 7. Notifications

- Push notification payloads are **generic by default** ("New message from John") — never message content — per FR-MSG-07.
- Orgs may opt into message-preview notifications; this is an explicit, auditable policy toggle, off by default, since previews are a confidentiality trade-off.

## 8. File Security

- Files are encrypted client-side before upload; server (R2) stores ciphertext only, referenced by an opaque storage key.
- Org-configurable allow-list of file types and max size, enforced on declared metadata before an upload URL is even issued.
- Executable/script/unknown-binary types blocked by default policy.
- External sharing can be disabled at the org level.
- **Malware scanning caveat:** conventional server-side AV scanning is incompatible with true E2EE (the server never sees plaintext). Options under design review: (a) client-side scanning before encryption using a local/embedded scanner, (b) trusted scanning proxy that the org explicitly opts into (a deliberate, documented reduction of the E2EE guarantee for that org), or (c) no scanning in v1 with clear documentation of the trade-off. The default for v1 is **(c)**, with (a) as the target enhancement.

## 9. Account & Key Recovery

Recovery must never quietly defeat E2EE. Supported models (org-selectable):

| Model | Description | Security level |
|---|---|---|
| Device-only (default) | Only an existing trusted device can authorize a new one; no server-side key escrow | Highest |
| Enterprise recovery key | Org holds a recovery key (customer-controlled, e.g., KMS/HSM) that can re-wrap a user's key material; every use is audited and typically requires dual control | Configurable, used for regulated enterprises |
| User backup | User-controlled encrypted backup protected by a strong recovery credential (not the login password) | Medium — depends on user credential hygiene |

Password reset (authentication credential) is always decoupled from key recovery: resetting a password never yields decrypted key material.

## 10. Audit Logging

- Audit events capture **security/administrative actions only** — never message content: user added/removed, role changed, group/channel created/deleted, membership approved, device registered/revoked, login occurred, MFA changed, security policy changed, cross-org access attempts denied.
- Audit logs are structured, timestamped, actor-attributed, org-scoped, and retained per configurable policy — designed to be tamper-evident (append-only table, no update/delete API surface exposed to admins beyond retention-driven purges).

## 11. Security Tiers (product-configurable)

| Tier | Auth | Devices | Additional controls |
|---|---|---|---|
| Standard | Password + MFA | Basic device registration | Basic audit |
| High Security | MFA mandatory, passkeys encouraged | Device approval required | Session/IP restrictions, shorter session lifetime, security alerts |
| Maximum Security | SSO + hardware security keys | Managed devices, attestation | Strict file policy, no external users, advanced audit, aggressive session expiration |

## 12. RBAC Summary (see PRD §38 for full matrix)

Enforced server-side on every request; least-privilege by default. Planned refinement beyond v1's Super Admin/Admin/Employee: split **Security Admin** (device/MFA/audit-focused) and **HR/Manager** (people/group-focused) so that, e.g., HR does not automatically inherit device-revocation or security-policy authority.

## 13. Required Pre-Production Gate

Before any production launch or public E2EE/zero-knowledge claim:
- [ ] Independent cryptographic protocol review
- [ ] Key management and multi-device sync review
- [ ] Group membership/key-rotation correctness review
- [ ] File handling and metadata model review
- [ ] Full penetration test (application + infrastructure)
- [ ] Remediation of all critical/high findings
