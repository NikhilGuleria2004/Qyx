# Qyx — Forward Plan: From Demo to Working Platform (Agent Entry Point)

**Read this file first, before touching any code.** `Implementation.md` and `todo.md` describe
the *intended* platform and claim (via all-`[x]` checkboxes) that milestones M1–M9 are done.
They are not. This document is a corrective audit plus the actual remaining build plan. It does
not replace `Implementation.md` — the stack, rules, design tokens, and Definition of Done in that
file still apply. This file tells you what is *actually* built, what only *looks* built, and the
order of work required to reach a platform a real user can open, register on, log into, and use.

---

## 0. Why this document exists

An earlier agent pass marked every phase in `todo.md` as complete. On inspection of the shipped
code, that is false. Concretely, opening the deployed frontend today gives you: one hardcoded
screen with a fake token (`demo-token`) and a fake org id (`org_demo`) baked into `App.tsx`,
static in-memory arrays standing in for messages and devices, and an admin console whose API
calls will all fail auth in a real deployment because no login flow exists to produce a real
token. There is no landing page, no register page, no login page, no routing, and no session
persistence. The backend is in meaningfully better shape than the frontend, but even it has not
been exercised end-to-end from a real UI.

**Do not trust `todo.md`'s checkmarks.** Treat every `[x]` in it as "an agent believes this is
done," not as verified fact, until re-confirmed under §2 of this document. `forwardTodo.md` is
the corrected, evidence-based tracker going forward — update it, not `todo.md`, and do not
check a box in either file without the evidence §2 requires.

---

## 1. Audit findings (as of this document's creation)

### 1.1 Frontend (`apps/web`) — the core gap

- `apps/web/src/App.tsx` is a **single 300+ line file** containing the entire application: no
  router, no pages, no route-based code splitting. Everything renders inside one component tree.
- `demoToken = 'demo-token'` and `demoOrgId = 'org_demo'` are hardcoded `useState` initializers,
  never replaced with a real session. Every admin screen is handed these fake values as props.
- Messages (`messages` state), devices (`devices` state), and the handshake sequence are **static
  arrays / fixtures**, not data fetched from the API or produced by real encryption.
- There is **no landing page**. There is **no register page**. There is **no login page**. There
  is **no route** a first-time visitor could use to create an account or an organization.
- `zustand` is a declared dependency but is **not imported or used anywhere** in `apps/web/src`
  — the "Zustand slices" architecture described in `Implementation.md` §3 does not exist yet.
- `react-router` (or any router) is **not installed**. Nothing in `13-frontend-specification.md`'s
  navigation model (Directory / Buffer / Inspector panes as real navigable views, not just
  conditionally-rendered JSX) is actually wired to URLs. Refreshing the page loses all state;
  there is nothing to deep-link to.
- The admin screens (`MembersScreen`, `GroupsScreen`, etc.) **do** call real `adminApi.ts`
  functions, which **do** call real `/v1/...` endpoints — this part is genuinely wired. But since
  they're only ever reachable with the fake demo token, none of them will function against a real
  backend without a real login flow in front of them.
- `packages/crypto` is real and has tests, but nothing in the shipped UI actually calls it as part
  of a user-facing flow (message compose/decrypt, device pairing) — the one call site in
  `App.tsx` is a hardcoded sample key used to print a fingerprint on load, not a real session.
- No E2E flow exists to validate this: `apps/web/e2e/smoke.spec.ts` should be checked and almost
  certainly does not (and cannot, given the above) exercise register → login → send message.

### 1.2 Backend (`apps/api-gateway`) — more real than the frontend, but unverified end-to-end

- Real route/service/schema modules exist for auth, organizations, users, devices, groups,
  channels, conversations, messages, files, alerts, audit, SSO, and WebAuthn, each with at least
  some unit/integration tests (28 test files repo-wide).
- `POST /auth/register` and `POST /auth/login` have real implementations (password hashing, TOTP,
  session issuance) — see `apps/api-gateway/src/services/auth/`.
- **None of this has been driven from a browser.** Backend tests running green in `vitest` is not
  the same as a person being able to open the site, register, and land in a working workspace.
  Treat every backend module as "unit-tested, not integration-proven" until §3 phases below close
  the loop.
- No confirmed evidence D1 migrations have been applied to a real (even local/dev) D1 instance, or
  that `wrangler dev`/`pnpm dev` actually serves a working full-stack session. Re-verify, don't
  assume.

### 1.3 Everything else claimed done in `todo.md` (M5–M9: groups/channels, files, admin surfaces,
observability, CI/CD, backups, security gate)

Unverified. Given the state of M1–M4, do not assume later milestones are further along than
described here just because `todo.md` says so. Re-audit each milestone against the evidence
standard in §2 before relying on its checklist state.

---

## 2. Evidence standard — how "done" is proven from now on

A box in `forwardTodo.md` may only be checked if the person or agent checking it can point to one
of the following, not to a memory of having written the code:

1. **A command that was actually run**, with its real exit code/output pasted or logged
   (`pnpm typecheck`, `pnpm test`, `pnpm build`, `wrangler dev` + a manual `curl`/browser check).
2. **A browser-observable behavior**: e.g., "navigated to `/register`, submitted the form, was
   redirected to `/login` with a success toast, logged in, landed on `/app`." Not "the register
   route exists in the router."
3. **A passing automated test that exercises the real path**, not a mock that assumes the thing
   it's supposed to prove.

If none of these exist yet for a task, it is **not done**, regardless of how much code was
written toward it. This standard applies retroactively — re-verify M1–M4 from `todo.md` using it
before building on top of them.

---

## 3. Build order to reach an actually-working platform

These phases assume the backend service layer from M1–M4 of `Implementation.md` is substantially
real (per §1.2) but unverified from the browser, and that the frontend is effectively starting
from zero beyond its design-token/component primitives (`packages/ui`) and the admin screen
components (which are real UI, just orphaned from any real session). Work through phases in
order. Each phase follows the Definition of Done in `Implementation.md` §9 — this document adds
frontend-specific detail where the gap is, it doesn't relax that bar.

### FW0 — Re-verify the foundation (don't rebuild it, prove it)

| Deliverable | Exit check |
|---|---|
| Confirm `pnpm install && pnpm dev && pnpm build && pnpm test && pnpm lint && pnpm typecheck` actually exit 0 today, on this checkout | Paste the real output; fix whatever fails before proceeding |
| Confirm a local D1 instance migrates cleanly and `apps/api-gateway` actually serves `/v1/auth/register` and `/v1/auth/login` against it | `curl` a real register + login round trip locally; paste the response |
| Confirm `wrangler dev` for `apps/web` and `apps/api-gateway` can run together and the web app can reach the API (proxy/CORS configured) | A browser network tab (or curl through the dev proxy) shows a successful `fetch` from web origin to API origin |

### FW1 — Routing & app shell restructure

- Add a router (React Router, matching what the rest of the stack already assumes — do not
  introduce a second competing pattern). Routes at minimum: `/`, `/register`, `/login`,
  `/mfa`, `/onboarding` (create/join org), `/app` (the authenticated workspace shell), `/app/*`
  for admin subviews currently gated behind `adminView` state.
- Split `App.tsx` into: a top-level `<AppRouter>`, a `PublicLayout`, an `AuthenticatedLayout`
  (the existing three-pane shell, kept — it's real, working UI), and per-route page components
  under `apps/web/src/features/<name>/pages/`.
- Exit check: every route above is directly linkable (typing the URL and hitting refresh lands on
  that view, not a blank/broken page); no more conditional-render-only navigation for primary
  flows.

### FW2 — Landing page

- Build `/` per `13-frontend-specification.md`'s visual system (design tokens in
  `Implementation.md` §5, IDE-shell aesthetic, JetBrains Mono, no generic SaaS gradient-hero
  template, no chat bubbles/avatars as decoration).
- Content: what the product is, primary CTA to `/register`, secondary link to `/login`. This is
  the one place a "no public zero-knowledge/E2EE claim" check (`Implementation.md` §2 rule 7)
  matters most — review copy against `07-security-design.md` §13 / ADR-011 before writing it, and
  flag rather than write any claim that gate hasn't cleared.
- Exit check: unauthenticated visitor sees this at `/`, not a blank page or the app shell.

### FW3 — Auth UI: Register → MFA → Login, wired to the real backend

- `/register`: organization + first-admin registration form → `POST /v1/auth/register` (real
  endpoint, already implemented server-side per §1.2) → on success, route to `/login` or directly
  into MFA setup if the flow requires it immediately for Super Admin (per FR-AUTH-04).
- `/login`: email/password → `POST /v1/auth/login` → handle `MFA_REQUIRED` response shape → route
  to `/mfa`.
- `/mfa`: TOTP code entry → `POST /v1/auth/mfa/verify` → on success, store session, route to
  `/app`.
- Real error states: invalid credentials, rate-limited, validation errors — surfaced from the
  API's `{ error: { code, message, request_id } }` envelope, not swallowed.
- No hardcoded tokens anywhere in this path or downstream of it.
- Exit check: a genuinely new person can open the site, register an org, verify MFA (or skip if
  role doesn't require it), and land authenticated in `/app` — with no code path touching
  `demo-token` or `org_demo`.

### FW4 — Session state (replace the demo state entirely)

- Introduce the Zustand session store `Implementation.md` §3 already specifies but which doesn't
  exist yet: `authStore` (user, org, role, access token, refresh handling), kept separate from
  UI-only state per the "UI state kept separate from domain/E2EE data state" rule.
- Wire `POST /auth/refresh` for silent token renewal; `POST /auth/logout` clears the store and
  routes to `/`.
- Add a route guard: unauthenticated access to `/app/*` redirects to `/login`; authenticated
  access to `/register` or `/login` redirects to `/app`.
- Replace every prop-drilled `token={demoToken}` / `orgId={demoOrgId}` in the admin screens
  (`App.tsx` lines wiring `MembersScreen`, `GroupsScreen`, `ChannelsScreen`, `RequestsScreen`,
  `OrgSettingsScreen`, `SecurityCenterScreen`, `AuditLogScreen`, `DevicesScreen`, `SSOScreen`,
  `AlertsScreen`) with values read from the real session store.
- Exit check: log in as two different real accounts in two browser profiles; each sees only their
  own org's data through the (already-real) `adminApi.ts` calls. This is also the first real,
  browser-driven test of the org-isolation guarantees `Implementation.md` treats as non-negotiable
  — if either account can see the other's data, stop and fix before continuing to FW5.

### FW5 — Organization onboarding

- If registration doesn't already create-or-join an org inline (check FW3's actual behavior),
  build the `/onboarding` step: create a new organization (with domain verification per P5 in
  `Implementation.md`) or join an existing one via an invite/domain match.
- Exit check: domain verification UI reflects real TXT-record check state (pending/verified), not
  a static badge.

### FW6 — Real workspace: conversations, not fixtures

- Replace the hardcoded `messages` array and the sample-key fingerprint call in `App.tsx` with a
  real `conversations` feature module (`api/`, `components/`, `hooks/`, `stores/`, `crypto/` per
  `Implementation.md` §3's frontend feature pattern).
- Wire conversation list, message send/receive through the real API (`/v1/conversations`,
  `/v1/conversations/:id/messages`) and, if `ConversationDO`/realtime is implemented server-side,
  the real WebSocket path — otherwise fall back to polling and flag the realtime gap explicitly
  rather than faking it with a timer.
- Route all encryption/decryption through `packages/crypto` using **real per-conversation session
  keys**, not the hardcoded sample key currently used only to print a fingerprint on load.
- Exit check: two real logged-in users in the same org can send a message to each other and see
  it decrypt correctly in each other's browser; a tampered/replayed frame is rejected, not
  silently accepted (per the AEAD requirement already in `Implementation.md` §6).

### FW7 — Device registration & pairing UI, for real

- Replace the static `devices` array with real calls to `GET/POST/DELETE /me/devices` and a real
  pairing-code flow (`POST /me/devices/:deviceId/authorize`), matching the UI that already exists
  in skeleton form (`identityOpen`, `pairingCode`, fingerprint comparison state in `App.tsx`) —
  that UI is a reasonable starting point, it just needs to stop being fed fixtures.
- Exit check: registering a second real device and completing the pairing flow actually changes
  that device's `status` from `pending` to `active` server-side, verified via the admin Devices
  screen (which is already correctly wired to `adminApi.ts` and just needs a real token).

### FW8 — Admin console: prove it against real data

- The admin screens themselves are real, working UI with real API calls (§1.1 confirms this).
  This phase is verification, not construction: with real sessions from FW3/FW4, walk every
  admin screen (Members, Groups, Channels, Requests, Org Settings, Security Center, Audit Log,
  Devices, SSO, Alerts) end-to-end against the live backend and fix whatever breaks now that
  fake tokens are gone.
- Exit check: every admin screen loads real data for the logged-in admin's real org, every
  create/update/delete action in each screen round-trips to D1 and reflects on reload.

### FW9 — E2E test suite that matches reality

- Rewrite/extend `apps/web/e2e/smoke.spec.ts` (Playwright) to cover: landing → register → MFA →
  login → land in `/app`; send/receive a message between two sessions; device pairing; one
  cross-org isolation negative test driven through the actual UI, not just the API test suite.
- Wire this into CI (`pnpm e2e`) as a blocking check per `10-deployment-cicd-specification.md`.
- Exit check: this suite is what future claims of "the platform works" must point to — a green
  run of it is the bar for saying a flow is done, not an agent's assertion.

### FW10 — Reconcile `todo.md`

- Once FW0–FW9 are complete and evidenced, go back through `todo.md` milestone by milestone and
  correct any checkbox that was marked `[x]` without the evidence standard in §2. Do not leave
  the original false-complete state in place — either it's now genuinely true, or it gets
  unchecked with a note pointing to the relevant `forwardTodo.md` item.

---

## 4. Rules that still apply, unchanged

Every rule in `Implementation.md` §2 (server never sees plaintext, no custom crypto, org
isolation at four layers, `organization_id` never trusted from the client, no hard deletes,
password reset/key recovery decoupling, no public E2EE claims pre-review, the
Route→Middleware→Service→Repository layering) governs this work exactly as it governs the rest
of the platform. This document adds a frontend-completion plan and a stricter evidence bar; it
does not loosen anything.

---

## 5. Definition of Done for this plan

Not "the code compiles." A first-time visitor, using only the deployed site with no prior
knowledge of the demo credentials, must be able to:

1. Land on a real landing page at `/`.
2. Register a new organization and their own admin account.
3. Complete MFA (if required for their role).
4. Log in on a second visit and be routed straight into the workspace.
5. See their own org's data only — verified by simultaneously logged-in accounts from a
   different org seeing none of it.
6. Send an end-to-end-encrypted message to a teammate and have it decrypt correctly.
7. Register and pair a second device.
8. As an admin, manage members/groups/channels/devices/audit log against real data.

Until all eight are true and demonstrated per the §2 evidence standard, the platform is not done
— regardless of what any prior checklist says.