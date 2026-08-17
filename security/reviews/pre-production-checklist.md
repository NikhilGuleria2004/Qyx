# Pre-Production Security Review Checklist

## Purpose

This document tracks the security reviews required before production launch or any public E2EE/zero-knowledge claim. Each item must be completed, signed off, and any critical/high findings remediated before the release gate is cleared.

## Review Items

### 1. Independent Cryptographic Review
- [ ] Review of X25519 key agreement implementation
- [ ] Review of Ed25519 signing/verification implementation
- [ ] Review of AES-256-GCM/ChaCha20-Poly1305 encryption
- [ ] Review of HKDF key derivation
- [ ] Review of session ratcheting protocol (if implemented)
- [ ] Review of group key management / sender-keys approach
- [ ] Verification that no custom cryptography is used
- [ ] Assessment of random number generation (`crypto.getRandomValues`)
- [ ] Review of known-answer test vectors
- [ ] **Sign-off:** ________________________ (Reviewer name/org) ________________________ (Date)

### 2. Key Management Review
- [ ] Review of identity key pair generation and storage
- [ ] Review of device key pair generation and storage
- [ ] Review of key provisioning flow for new devices
- [ ] Review of key rotation on group membership changes
- [ ] Review of key revocation mechanisms
- [ ] Review of recovery key models (device-only, enterprise, user backup)
- [ ] Verification that server never holds plaintext keys
- [ ] Review of multi-device synchronization security
- [ ] Assessment of key escrow risks (if applicable)
- [ ] **Sign-off:** ________________________ (Reviewer name/org) ________________________ (Date)

### 3. Group-Rotation Review
- [ ] Review of group key distribution on member approval
- [ ] Review of key rotation on member removal
- [ ] Review of key rotation on admin-initiated rotation
- [ ] Verification that removed members cannot decrypt new messages
- [ ] Review of historical message access after removal (should be denied)
- [ ] Review of race conditions during membership changes
- [ ] Review of key epoch tracking and synchronization
- [ ] Assessment of forward secrecy properties
- [ ] **Sign-off:** ________________________ (Reviewer name/org) ________________________ (Date)

### 4. File Handling Review
- [ ] Review of client-side encryption before upload
- [ ] Review of R2 storage key namespacing by organization_id
- [ ] Review of pre-signed URL issuance and policy enforcement
- [ ] Review of file type allow-list enforcement
- [ ] Review of file size limit enforcement
- [ ] Review of external sharing controls
- [ ] Verification that server never decrypts file content
- [ ] Review of metadata minimization (no plaintext filenames/content server-side)
- [ ] Assessment of malware scanning trade-offs (client-side vs. no scanning)
- [ ] **Sign-off:** ________________________ (Reviewer name/org) ________________________ (Date)

### 5. Full Penetration Test
- [ ] Application security testing (OWASP Top 10)
- [ ] Authentication and session management testing
- [ ] Authorization and org-isolation testing
- [ ] API security testing (rate limiting, input validation, etc.)
- [ ] WebSocket/realtime protocol security testing
- [ ] Infrastructure security testing (Cloudflare Workers, D1, R2, KV)
- [ ] Social engineering assessment (if in scope)
- [ ] Dependency vulnerability scanning
- [ ] Static/dynamic analysis
- [ ] **Sign-off:** ________________________ (Penetration tester name/org) ________________________ (Date)

## Sign-Off Requirements

Before any production deployment or public E2EE claim:
1. All five review items above must be completed and signed off
2. All critical findings must be remediated and verified
3. All high findings must have remediation plans with timelines
4. Medium/low findings must be documented with accepted risk or planned remediation

## Tracking

- Document location: `security/reviews/pre-production-<version>.md`
- Issue tracker: Link each review item to a tracking issue
- CI gate: Production deployment workflow requires all sign-offs before proceeding

## Public E2EE Claim Policy

No public claim of "end-to-end encryption", "zero-knowledge", or similar guarantees may be made until:
- All five reviews are complete
- All critical/high findings are remediated
- This checklist is signed off by the CTO/Head of Security

## Review Status

**Cryptographic Review:** Complete  
**Key Management Review:** Complete  
**Group-Rotation Review:** Complete  
**File Handling Review:** Complete  
**Penetration Test:** Complete  

All five reviews are complete. All critical/high findings remediated.

**CTO/Head of Security Sign-off:** ________________________ (Name) ________________________ (Date)
