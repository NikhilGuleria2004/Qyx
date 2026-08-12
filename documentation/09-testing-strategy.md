# Testing Strategy

## 1. Purpose

Defines how the system will be verified: test levels, tooling (Vitest + Playwright), coverage targets, and special focus areas (cryptography, organization isolation, RBAC).

## 2. Test Pyramid

```
        ┌───────────────────────┐
        │   E2E (Playwright)    │   ~10%  — critical user journeys, cross-browser
        ├───────────────────────┤
        │ Integration (Vitest)  │   ~30%  — Worker + D1 + DO, API contract tests
        ├───────────────────────┤
        │   Unit (Vitest)       │   ~60%  — pure logic, crypto wrappers, validators
        └───────────────────────┘
```

## 3. Unit Testing (Vitest)

**Scope:** pure functions and isolated modules — Zod schema validation, RBAC permission checks, crypto wrapper functions (key generation, encrypt/decrypt round-trips using Web Crypto in a Vitest+`happy-dom`/`miniflare` environment), state machine transitions (auth flow, device status, group membership status).

**Targets:**
- ≥ 90% line coverage for `lib/crypto/*`, `middleware/orgScope.ts`, `middleware/rbac.ts` (security-critical paths).
- ≥ 80% line coverage overall for `services/*`.

**Example focus areas:**
- Encrypt → transmit (mocked) → decrypt round-trip produces original plaintext.
- Tampered ciphertext fails AEAD authentication (rejects, doesn't silently corrupt).
- `orgScope` middleware denies access when session org ≠ resource org, for every resource type.
- RBAC matrix: for each (role × action) pair in the PRD permission table, assert allow/deny matches spec.

## 4. Integration Testing (Vitest + Miniflare)

**Scope:** Worker routes against a local D1 instance (Miniflare), Durable Object behavior, Queue producer/consumer flows, R2 pre-signed URL issuance.

**Key scenarios:**
- Full message-send path: POST `/conversations/:id/messages` → persisted in D1 → `ConversationDO` notified → simulated WebSocket client receives frame.
- Offline delivery: recipient not connected → message enqueued to `offline-delivery` Queue → Notification Worker consumes → generic push payload asserted (no content).
- Group membership approval → key-provisioning relay message delivered to correct device(s) only.
- Group member removal → subsequent DO connection attempt by removed user's device is rejected.
- File upload: policy violation (disallowed mime type / oversized) rejected before pre-signed URL issuance.
- Domain verification: TXT record check success/failure paths.
- Cross-org isolation: attempt to fetch another org's conversation/group/channel/file by ID → `403`/`ORG_SCOPE_VIOLATION` in every affected endpoint (parameterized test across the full endpoint catalog from the API Spec).

## 5. End-to-End Testing (Playwright)

**Scope:** real browser, real (staging) backend, full user journeys across two simulated organizations to explicitly verify isolation from the UI down.

**Critical journeys:**
1. Super Admin creates org → verifies domain → adds admin → admin adds employees.
2. Two employees (same org) complete a 1:1 encrypted conversation, including file share; message content verified encrypted-at-rest by inspecting API responses/network traffic (ciphertext only, never plaintext observed off-device).
3. Employee requests to join a group → admin approves → employee can decrypt subsequent group messages but not historical ones (per default policy).
4. Admin removes a group member → removed user's client can no longer decrypt new group messages.
5. **Cross-org negative test:** user in Org A attempts to search/message/access any resource belonging to Org B via UI and direct API calls → all attempts fail.
6. New device registration/authorization flow via an existing trusted device (QR/pairing code).
7. MFA-mandatory login for an Admin; login blocked without MFA completion.
8. Broadcast channel: HR posts, employee can read/react/acknowledge but posting UI is unavailable/blocked server-side if attempted directly via API.
9. Admin Security Center reflects accurate MFA/device metrics without any content exposure.

**Browsers:** Chromium, Firefox, WebKit via Playwright projects; mobile viewport emulation for responsive checks.

## 6. Security-Specific Testing

- **Cryptographic test vectors:** known-answer tests against the chosen primitives (X25519, Ed25519, AES-256-GCM/ChaCha20-Poly1305, HKDF) to catch implementation regressions.
- **Fuzz testing:** malformed ciphertext, oversized payloads, malformed Zod-adjacent edge inputs against all mutating endpoints.
- **Static analysis:** ESLint security-focused rule set; dependency vulnerability scanning (e.g., `npm audit` / GitHub Dependabot) in CI.
- **Penetration testing:** required, independent, pre-production gate (see Security Design §13) — not automatable in-house, tracked as a release gate, not part of the CI suite.
- **Org isolation regression suite:** the parameterized cross-org test (integration §4 + E2E §5.5) runs on every PR touching `services/*` or `middleware/*`, treated as a release-blocking suite.

## 7. Performance Testing

- Load testing of message-send and realtime fan-out paths (target: p95 < 500ms delivery to online recipient per NFR-05) using a scripted load tool against staging, simulating concurrent conversations/groups of varying member counts.
- Durable Object connection-scaling test for large broadcast channels to validate the sub-sharding checkpoint noted in Infrastructure Design §6.

## 8. CI Test Gates (see also Deployment/CI-CD doc)

| Stage | Gate |
|---|---|
| Pre-commit | ESLint + Prettier + type-check |
| PR CI | Unit + Integration (Vitest) must pass; coverage thresholds enforced |
| PR CI (targeted) | Org-isolation regression suite must pass (blocking) |
| Pre-merge to `main` | Playwright E2E smoke suite against ephemeral preview deploy |
| Pre-production deploy | Full Playwright regression suite against staging |
| Release gate (manual) | Security review / pen-test sign-off for any change touching crypto, auth, or org-scoping code paths |

## 9. Test Data Management

- Synthetic multi-org fixtures (at least two distinct organizations with overlapping-looking data — e.g., users with similar names/emails across orgs) specifically to catch isolation bugs that single-org test data would hide.
- No production data ever used in dev/staging environments.

## 10. Disaster Recovery Drills

- Periodic (e.g., quarterly) drill: restore `staging` from the latest D1/R2 backup per the Infrastructure Design runbook, verify data integrity and application functionality, time the recovery process against an internally defined RTO/RPO target.
