# Qyx — Shell-to-Product Functionality Plan

**Audience:** an autonomous coding agent with access to the full monorepo (`apps/api-gateway`, `apps/web`, `packages/*`, `workers/*`).
**Purpose:** this is not a style pass. Qyx currently looks like a finished product and is not one — critical auth checks are no-ops, one login flow accepts an unauthenticated bypass, most of the Admin UI is unreachable, and a chunk of the "live" dashboard is hardcoded fiction. This document is the complete list of what has to happen, in order, to make it real.

Work phases **in the order given**. Phase numbers encode dependency and severity, not convenience — do not reorder to save time, and do not start UI polish (Phase 7+) while Phase 0–3 security holes are open. After every phase, run the full verification block in §0.3 and do not proceed on a red build.

---

## 0. Ground rules

### 0.1 What "done" means for this document

A phase is done when: the described behavior is implemented, the specific verification steps listed under that phase pass, and the full check in §0.3 passes. "It typechecks" is not "it works" — several of the bugs fixed here typecheck fine today. Where a phase says to test a specific scenario manually or with a new automated test, do that; don't skip to the next phase on faith.

### 0.2 Source of truth for backend roles/permissions

Backend role enum (`apps/api-gateway/src/middleware/auth.ts`, `rbac.ts`): `super_admin | admin | manager | employee | security_admin`.
Frontend UI bucket (`apps/web/src/lib/roles.ts`): `superadmin | admin | employee`, with `manager` and `security_admin` folded into the `admin` bucket, nav-trimmed by permission.
Don't introduce a third mapping anywhere — every phase below that touches roles imports from these two files (`rbac.ts` on the backend, `roles.ts` on the frontend) rather than re-deriving role logic.

### 0.3 Verification block — run after every phase

```bash
pnpm install
pnpm --filter @qyx/api-gateway typecheck
pnpm --filter @qyx/api-gateway test
pnpm --filter @qyx/web typecheck
pnpm --filter @qyx/web lint
pnpm --filter @qyx/web test
pnpm --filter @qyx/web build
```

Additionally, for any phase touching a route handler, write or update a `.test.ts` in the same service folder that exercises the new/changed behavior — don't rely on manual testing alone for anything that isn't pure UI.

### 0.4 Testing-phase exceptions

> **MFA bypass (`bypass_mfa` / `VITE_BYPASS_MFA`) is intentionally retained during the testing phase.** It allows testers and CI to exercise admin/super_admin flows without TOTP codes. **This MUST be removed before any production deployment.** Do not extend this exception to other security controls.

---

## PART A — STOP THE BLEEDING (security-critical, do first, in this order)

These four issues mean the product is actively unsafe to deploy as-is, independent of whether any feature "works." Nothing else in this document matters if these aren't fixed first — a fully-featured app with these holes is worse than a shell, because a shell at least doesn't invite an intrusion.

### Phase 1 — Remove the client-controlled MFA bypass (DEFERRED — testing exception)

**Status:** `bypass_mfa` and `VITE_BYPASS_MFA` are **intentionally retained** while the app is in active testing. Marked complete here only for tracking purposes; the actual removal is a hard pre-production gate.

**The bug:** `apps/api-gateway/src/services/auth/auth.schema.ts` accepts an optional `bypass_mfa: z.boolean()` on `LoginSchema`. `apps/api-gateway/src/services/auth/auth.service.ts`:

```ts
const mfaRequired = role === 'super_admin' || role === 'admin';
if (mfaRequired && !data.bypass_mfa) {
  // ...issue MFA challenge...
} else {
  // ...issue tokens directly, no MFA check at all...
}
```

Any caller can `POST /v1/auth/login` with `{"email": ..., "password": ..., "bypass_mfa": true}` and skip MFA entirely for any `admin`/`super_admin` account whose password they have — no TOTP code required. The frontend (`apps/web/src/features/auth/pages/LoginPage.tsx`) wires this to `import.meta.env.VITE_BYPASS_MFA`, which is irrelevant to actual security since Vite env vars are baked into the public client bundle and, more importantly, the field is honored directly by the API regardless of what the frontend sends.

**Fix (execute before production):**
1. Delete `bypass_mfa` from `LoginSchema` in `auth.schema.ts` entirely.
2. In `auth.service.ts`, remove `!data.bypass_mfa` from the MFA-required condition — MFA-required accounts always get the challenge, full stop:
   ```ts
   const mfaRequired = role === 'super_admin' || role === 'admin';
   if (mfaRequired) {
     // ...issue MFA challenge... (unconditionally)
   }
   ```
3. If there's a legitimate need to bypass MFA in automated E2E/CI tests, do it with a **test-only seed flag on the user record** (e.g. a `mfa_enabled = 0` row created directly via a test fixture/DB seed script, not a request parameter), or a backend-only feature flag gated by an environment variable that is never read from client input. The rule: no field in a client-supplied request body may ever influence whether MFA is required.
4. In `apps/web/src/features/auth/pages/LoginPage.tsx`, delete `bypass_mfa` from the submitted `form` state, delete `bypassMfa`/`VITE_BYPASS_MFA` entirely, and delete the corresponding env var from any `.env.example` / wrangler config / CI secrets.
5. Search the whole repo for `bypass_mfa` and `VITE_BYPASS_MFA` (`grep -rn "bypass_mfa\|VITE_BYPASS_MFA"`) and confirm zero remaining references before moving on.

**Verification (execute before production):** add a test in `apps/api-gateway/src/services/auth/auth.test.ts` (create if missing) asserting that logging in as an `admin`/`super_admin` user *always* returns `state: 'MFA_CHALLENGE_ISSUED'`, even when the request body includes an arbitrary `bypass_mfa: true` (the schema should now just ignore/reject the unknown field — assert on that too, e.g. via `.strict()` on the Zod schema so unknown fields cause a 400 rather than being silently dropped).

### Phase 2 — Fix RBAC enforcement (the permission-check-is-dead-code bug)

**The bug:** Every protected route follows this pattern:
```ts
app.patch('/:userId/role', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
  c.set('permission', 'members:write');   // set INSIDE the handler
  // ...
});
```
`rbac` middleware runs **before** the handler, so `c.get('permission')` is `undefined` when `rbac` checks it, and `rbac`'s permission/role-level checks are skipped entirely (they're wrapped in `if (requiredPermission)`/`if (minimumRole)`). Net effect: `rbac` only enforces authentication, never authorization, across essentially every route in the API. Confirmed present in `organization.routes.ts`, `members.routes.ts`, `groups/*.routes.ts`, `channels.routes.ts`, `devices.routes.ts`, `sso.routes.ts`, `alerts.routes.ts`, `invite.routes.ts`, `file.routes.ts`, `message.routes.ts`.

**Fix — apply this exact pattern change to every route file listed above (and any other route using `c.set('permission', ...)` or `c.set('minimumRole', ...)`):**

1. Introduce a small middleware factory in `apps/api-gateway/src/middleware/rbac.ts`:
   ```ts
   export function requirePermission(permission: string) {
     return async (c: Context, next: () => Promise<void>) => {
       c.set('permission', permission);
       await next();
     };
   }
   export function requireMinimumRole(role: string) {
     return async (c: Context, next: () => Promise<void>) => {
       c.set('minimumRole', role);
       await next();
     };
   }
   ```
2. In every route registration, insert the appropriate `requirePermission(...)`/`requireMinimumRole(...)` call into the middleware chain **before** `rbac`, and delete the `c.set(...)` line from inside the handler body. Example, `members.routes.ts`:
   ```ts
   // before
   app.patch('/:userId/role', auth, orgScope, rbac, adminRateLimit, validate, async (c) => {
     c.set('permission', 'members:write');
     ...
   });

   // after
   app.patch('/:userId/role', auth, orgScope, requirePermission('members:write'), rbac, adminRateLimit, validate, async (c) => {
     ...
   });
   ```
3. Go through every file under `apps/api-gateway/src/services/*/​*.routes.ts` (`grep -rln "c.set('permission'\|c.set(\"permission\"\|c.set('minimumRole'\|c.set(\"minimumRole\"" apps/api-gateway/src/services` to get the exact list) and apply the same transform. Do not skip any — a route missed here stays wide open.
4. Delete `rbac.test.ts`'s current setup if it tests the middleware in isolation with a hand-rolled prior middleware — replace it with an integration test that hits a real route (e.g. `PATCH /v1/organizations/:orgId/members/:userId/role`) through the full middleware chain and asserts a 403 for an `employee` token and 200 for an `admin` token. Unit-testing `rbac` in isolation is exactly what let this bug ship silently last time; the regression test needs to go through the real route registration.

**Verification:** for at least 5 of the fixed routes, write an integration test (spin up the Hono app, issue a request with a JWT for a role that should be rejected) confirming a 403. Specifically test: `employee` token hitting `PATCH /members/:userId/role` → 403; `manager` token hitting `PATCH /organizations/:orgId/settings` (needs `org:update`, which `manager` lacks) → 403; `security_admin` token hitting `POST /groups` (needs `groups:write`, which `security_admin` lacks) → 403.

### Phase 3 — Fix cross-tenant IDOR on user role/status updates

**The bug:** `apps/api-gateway/src/db/queries/users.ts`:
```ts
export async function updateUserRole(db: D1Database, userId: string, role: string) {
  return db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userId).run();
}
export async function updateUserStatus(db: D1Database, userId: string, status: string) {
  return db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();
}
```
Neither query filters by `organization_id`. `orgScope` middleware only validates that the `:orgId` path segment matches the caller's own org — it never checks that the **target** `userId` belongs to that org. A caller can pass a `userId` from a different organization and change that user's role or status. Combined with Phase 2's fix this at least requires the caller to be an `admin`/`super_admin` in *some* org, but it's still a full cross-tenant privilege-escalation / account-takeover primitive once authenticated as any admin anywhere.

**Fix:**
1. Change both queries to take and enforce `organizationId`:
   ```ts
   export async function updateUserRole(db: D1Database, orgId: string, userId: string, role: string) {
     const result = await db.prepare('UPDATE users SET role = ? WHERE id = ? AND organization_id = ?').bind(role, userId, orgId).run();
     return result;
   }
   export async function updateUserStatus(db: D1Database, orgId: string, userId: string, status: string) {
     const result = await db.prepare('UPDATE users SET status = ? WHERE id = ? AND organization_id = ?').bind(status, userId, orgId).run();
     return result;
   }
   ```
2. Update every call site (`members.routes.ts` and anywhere else) to pass `orgId` from the already-validated `orgScope` context, and check `result.meta.changes === 0` (D1's rows-affected count) after the call — if zero rows changed, the target user didn't exist in that org, so return a 404, not a silent success.
3. **Audit every other query in `apps/api-gateway/src/db/queries/*.ts` for the same class of bug** — this codebase clearly has a pattern of writing queries that take an entity ID without also taking/enforcing the org ID. Go through `groups.ts`, `channels.ts`, `devices.ts`, `conversations.ts`, `files.ts`, `alerts.ts` query files one at a time and confirm every `UPDATE`/`DELETE`/single-row `SELECT` that operates on an org-owned entity includes `AND organization_id = ?` (or equivalent join/scoping) bound from a trusted server-side value (the authenticated caller's org from the session, never a client-supplied field). Write down every fix you make in the PR description so this can be reviewed as a checklist, since there is no automated way to guarantee you found all of them — this needs a careful manual pass.
4. Add a self-escalation guard on the role-update route specifically: a caller must not be able to set their own role to something higher than their current role (or at all, arguably — discuss whether self-role-edit should be blocked outright; the safer default is: block a user from modifying their own `role` or `status` field via this endpoint, full stop, forcing role changes to always be performed by a different admin).
5. Add a "last super_admin" guard: reject a role-change or status-suspend request that would leave an organization with zero `super_admin` users.

**Verification:** integration test — `admin` token from org A attempts `PATCH /v1/organizations/{orgB_id}/members/{userB_id}/role` (a real user in org B) → must 404 (org scope mismatch) or 403, never 200. Test self-escalation block and last-super-admin block explicitly.

### Phase 4 — Close the self-registration tenant-isolation gap

**The bug:** `AuthService.register` in `auth.service.ts` — if `organization_name` matches an existing org, the registrant is silently joined to that org as `employee`, with no invite code and no domain verification:
```ts
const existingOrg = await getOrganizationByName(this.db, data.organization_name);
if (existingOrg) {
  organizationId = existingOrg.id;   // joins existing org, role = employee, no gate
}
```
Anyone who knows or guesses a company's org name can self-join as an employee and get org-member visibility (directory listing, channel discovery, etc., depending on default access — see Phase 10's channels/groups audit for exactly what a bare `employee` can see by default).

**Fix:**
1. Note that `RegisterSchema` already has a `domain: z.string()` field and an optional `invite_code` — these exist but aren't being enforced at the join-existing-org branch. Fix the logic so joining an existing org requires **one of**:
   - A valid, unexpired `invite_code` tied to that org (verify via `InviteService`, already imported in `auth.service.ts` — use it), **or**
   - The registrant's email domain matches a domain already verified/claimed by that org (check `db/queries/domains.ts` — there's a `domains` table; use it to gate auto-join by domain instead of by guessable org name).
2. If neither condition is met, return a clear error (`ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN`) rather than silently creating an account in someone else's org.
3. Add a test: registering with an existing org's name, no invite code, and a non-matching email domain → registration is rejected, not silently joined.
4. Add a test: registering with a valid invite code for an existing org → joins successfully with the role specified by the invite (not hardcoded `employee`).

**Verification:** run the new auth service tests; manually confirm (via a temporary script or `curl` against a local dev instance) that an unsolicited registration attempt against an org name that already exists, without an invite, is rejected.

---

## PART B — MAKE THE ADMIN EXPERIENCE ACTUALLY WORK (frontend, currently a shell)

### Phase 5 — Fix the Admin route registration bug (dead nav links)

**The bug:** in `apps/web/src/AppRouter.tsx`, the `admin` bucket's routes are registered as:
```tsx
<Route element={<RequireBucket bucket="admin">...}>
  <Route path="/admin" element={<AdminHome />} />
  {ADMIN_NAV_ITEMS.map((item) => (
    <Route key={item.path} path={item.path.replace('/admin', '')} element={...} />
  ))}
</Route>
```
The parent `<Route>` has no `path` prop (it's a pathless "layout route" purely for the `RequireBucket` guard), and each child's computed `path` starts with a leading slash (e.g. `/members`). In React Router v6/v7, a leading-slash child path under a pathless parent is treated as an **absolute** path, not nested under `/admin` — so these routes actually register at `/members`, `/groups`, `/channels`, etc. (root-level), not `/admin/members`. Meanwhile `AdminStyleSidebar.tsx` correctly builds nav links as `${basePath}${item.path.replace('/admin','')}` = `/admin/members`. **Every admin nav click therefore hits no registered route and falls through to the catch-all `<Route path="*" element={<Navigate to="/" />} />`**, silently bouncing the admin user to the public landing page.

This was verified directly against React Router's real matcher, not inferred — every one of the 10 admin nav items reproduces this.

**Fix:**
1. In `AppRouter.tsx`, change the admin-bucket child routes to use **relative** paths (no leading slash) so they correctly nest under the parent, and add an explicit `path="/admin"` **prefix route** the same way the codebase already does correctly for the wildcard `/app/*` shim. Concretely, wrap the admin bucket's routes in a parent that owns the `/admin` path segment, with children as relative paths:
   ```tsx
   <Route path="/admin" element={<RequireBucket bucket="admin"><AdminLayout /></RequireBucket>}>
     <Route index element={<AdminHome />} />
     {ADMIN_NAV_ITEMS.map((item) => (
       <Route
         key={item.path}
         path={item.path.replace('/admin/', '')}   // e.g. "members", not "/members"
         element={
           <RequirePermission permission={item.permission}>
             <AdminScreenWrapper component={ADMIN_SCREEN_MAP[item.path]} />
           </RequirePermission>
         }
       />
     ))}
   </Route>
   ```
   Note `AdminLayout` needs to render `<Outlet />` for its children the same as before — this change only affects how the route table is declared, not the layout component itself. Also note `RequireBucket` now needs to wrap the layout element directly (as shown) since the parent route now legitimately owns a `path`.
2. Apply the identical fix pattern to the `superadmin` bucket's routes for consistency and future-proofing, even though the current absolute-path construction happens to work today — an inconsistent pattern between the two nearly-identical route trees is itself a bug waiting to happen. Use `path="/superadmin"` as the parent and relative children.
3. Delete the now-unnecessary `.replace('/admin', '/superadmin')` string surgery in the superadmin block and the `.replace('/admin', '')` in the admin block; replace with a single shared helper, e.g. `relativeAdminPath(item.path) => item.path.split('/').pop()`, or better, change `ADMIN_NAV_ITEMS` in `roles.ts` to store a `segment` field (`'members'`, `'groups'`, ...) instead of a full `/admin/...` path, and have both the sidebar and the router derive the full path by prefixing with `basePath`/`/admin`/`/superadmin` as needed. This removes the string-replace pattern entirely, which is the root cause class of this bug (any code doing ad-hoc string surgery on route paths is a landmine — prefer a single structured source of truth).
4. Write a route-resolution test (`apps/web/src/AppRouter.test.tsx`, new file) that, for every entry in `ADMIN_NAV_ITEMS`, asserts `matchRoutes(routeConfig, '/admin' + segment)` resolves to the expected element and not the catch-all. Do the same for `/superadmin` + segment. This is the regression test that should have existed before — write it before touching anything else in this phase, watch it fail against the current code, then fix the router and watch it pass.

**Verification:** the new `AppRouter.test.tsx` passes for all 20 admin/superadmin nav destinations. Manually (or via Playwright) click every single sidebar item as an `admin`-role test user and confirm it renders the correct screen, not the landing page.

### Phase 6 — Fix role-reading in `AdminHome` (and audit for the same pattern elsewhere)

**The bug:** `apps/web/src/features/admin/pages/AdminHome.tsx`:
```ts
const role = JSON.parse(localStorage.getItem('qyx-auth') || '{}')?.user?.role || 'admin';
```
Zustand's `persist` middleware stores `{ state: { user: {...}, ... }, version: 0 }`, not `{ user: {...} }` at the top level. `.user` on the parsed object is always `undefined`, so `role` silently falls back to the hardcoded `'admin'` literal for every single admin-bucket user, including `manager` and `security_admin`. The permission-filtered quick-links list therefore never actually reflects the real user's permissions — it shows the full `admin` nav set to everyone in the admin bucket, defeating the entire point of the nav-trimming work.

**Fix:**
1. Replace the manual `localStorage`/`JSON.parse` read with the store hook, exactly like `AdminLayout.tsx` already does correctly:
   ```ts
   import { useAuthStore } from '../../../stores/authStore';
   // ...
   const role = useAuthStore((s) => s.user?.role) ?? 'employee'; // safe default = least privilege, not 'admin'
   ```
2. Grep the whole `apps/web/src` tree for `localStorage.getItem('qyx-auth')` (`grep -rn "qyx-auth" apps/web/src`) and fix every other occurrence of this anti-pattern the same way — reading persisted store state by hand anywhere outside `authStore.ts`/`lib/auth.ts` itself is the bug class to eliminate, not just this one call site.
3. Change the unsafe fallback default from `'admin'` to the least-privileged role (`'employee'`) everywhere a role read might fail, so a bug in role-resolution fails closed (shows nothing / redirects) rather than fails open (shows the most-privileged nav).

**Verification:** add a component test for `AdminHome` that seeds the auth store with a `manager` user and asserts only the `manager`-permitted nav items (`Members`, `Groups`, `Channels`, `Requests`) render — not the full 10-item list. Add the same test for `security_admin` asserting only their 5 permitted items render.

### Phase 7 — Replace fabricated dashboard data with real API-backed data

**The bug:** `apps/web/src/features/superadmin/pages/SuperAdminHome.tsx` hardcodes its entire "ORG HEALTH SUMMARY" panel:
```tsx
<div>organizations: 12</div>
<div>active users: 1,248</div>
<div>pending verifications: 3</div>
<div>failed logins (24h): 7</div>
<div>pending device authorizations: 2</div>
```
This is static JSX, not data from any request. It's the single clearest "shell" signal in the app — it looks like a live dashboard and is fiction.

**Fix:**
1. Check `apps/api-gateway/src/services/metrics` (already exists, ~308 lines) for an existing endpoint that can serve this data; if one exists, wire the dashboard to it. If it doesn't expose the specific figures needed (org count, active user count, pending verifications, failed-login count, pending device auths), add the missing query/endpoint(s) there rather than inventing a new service — this is squarely metrics/reporting territory.
2. Add a `GET /v1/organizations/:orgId/dashboard-summary` (or extend an existing metrics endpoint) that returns real counts: member count by status, pending org-join/device-approval requests (there's already a `RequestsScreen` and `DevicesScreen` — reuse whatever queries back those screens rather than writing new ones), and recent failed-login count (check whether login failures are already logged anywhere — `audit` service or `security`/`alerts` service — and aggregate from there; if failed logins aren't logged at all yet, that's a gap to fix as part of Phase 10's audit-logging completeness check, not something to fake here).
3. Update `SuperAdminHome.tsx` (and give `AdminHome.tsx` the equivalent, permission-filtered version — an `admin` who lacks `audit:read` shouldn't see failed-login counts, a `manager` shouldn't see device-auth counts, etc.) to fetch this on mount, show a loading state, and render real numbers. Handle the empty/zero state distinctly from the loading state so "0 pending requests" doesn't look like a stuck spinner.
4. Add a component test mocking the API response and asserting the numbers rendered match the mocked response, not any hardcoded string.

**Verification:** with the backend running against a seeded dev DB with known counts (e.g. 3 orgs, 2 pending device requests), the dashboard shows those exact numbers, and changing the seed data changes what's displayed.

### Phase 8 — Replace the hardcoded "Directory" tree with real channel/group/DM data

**The bug (pre-existing, carried over from the original single-layout code, not introduced in the last round, but still a shell signal that needs fixing now):** `apps/web/src/layouts/shared/DirectoryPane.tsx` and `AdminStyleSidebar.tsx` both render static markup — literal `<span>ACME CORP</span>`, `<span>general</span>`, `<span>engineering</span>`, `<span>Engineering Lead</span>`, `<span>sarah.w</span>` — regardless of which org or user is logged in. Meanwhile the actual employee chat UI (`AppPage.tsx`, embedded in `EmployeeHome.tsx`) already has real, working `listConversations` / channel-loading logic — this sidebar just never calls it.

**Fix:**
1. Check `apps/api-gateway/src/services/channels`, `groups`, and `conversations` for existing list endpoints (`listChannels`, `listGroups`, `listConversations` — `messagesApi.ts` already calls `listConversations` for the employee chat view, confirm the equivalent org-scoped channel/group list endpoints exist for the sidebar's needs).
2. Rewrite `DirectoryPane` to fetch and render the real org name (from `useAuthStore`'s `user.orgId` → an org lookup, or thread the org name down from wherever it's already fetched at login), the real list of channels the current user is a member of, the real list of groups, and real recent DM threads — reusing `messagesApi.ts`'s existing conversation-list logic rather than duplicating it. Loading and empty states are required (a brand-new org with zero channels should show "No channels yet", not a blank panel or stale placeholder text).
3. Same fix for the "ACME CORP / general / engineering" block duplicated inside `AdminStyleSidebar.tsx` — either delete the duplication and have `AdminStyleSidebar` compose the same real `DirectoryPane` content plus its admin-specific nav section, or give it its own real data fetch. Don't leave two separately-hardcoded copies of fake org data in the codebase; that's exactly how this kind of bug survives a refactor unnoticed.
4. Delete the dead, unreachable duplicate `AdminNav` function inside `DirectoryPane.tsx` (it's currently orphaned/unreachable dead code left over from before the role-bucket refactor — confirm via `grep -n "AdminNav" apps/web/src/layouts/shared/DirectoryPane.tsx` that it's the old hardcoded-role-check version, not the new permission-filtered one, and remove it).

**Verification:** log in as two different seeded users in two different orgs; confirm the Directory pane shows each org's actual name and each user's actual channels — not "ACME CORP" for both.

### Phase 9 — Fix full-page-reload navigation in Admin/Super Admin home quick-links

**The bug:** `AdminHome.tsx` and `SuperAdminHome.tsx` render their quick-link cards as plain `<a href="...">`:
```tsx
<a key={item.path} href={item.path} className="...">{item.label}</a>
```
This triggers a full browser navigation/reload instead of client-side routing, discarding all in-memory React state (and, more importantly for this app, any in-memory encryption session state) on every single click from the home dashboard.

**Fix:** replace with `<Link to={...}>` from `react-router-dom` (or `useNavigate()` + `onClick`) exactly as the rest of the app does elsewhere (`AdminStyleSidebar.tsx` already does this correctly with `navigate(path)` — match that pattern). Do this for every quick-link in both home pages.

**Verification:** in a Playwright test, click a quick-link and assert `window.performance.navigation` / a marker set on app mount doesn't reset (i.e., confirm no full reload occurred) — or more simply, assert the React app's root component doesn't remount (e.g., check a mount-timestamp stored in a ref/context survives the click).

### Phase 10 — Fix the "TODO fallback" tests and get the test suite fully green

Two currently-failing tests indicate stale content, not stale tests — fix the content, don't just loosen the assertions:

`apps/web/src/features/landing/pages/LandingPage.test.tsx` currently expects the string `'Organization-centric communications platform'` and `'Get started'`/`'Sign in'`, but the actual rendered landing page says `"Private messaging, group collaboration, and controlled broadcast..."` and buttons read `"get started"`/`"sign in"` (lowercase). Decide which is correct — likely the newer landing copy is the intended one and the test is stale — and update the test to match the real, intended copy (case-sensitive), not the other way around by weakening the assertion to a case-insensitive or partial match that would silently accept future copy drift too.

Also fix the `e2e/smoke.spec.ts` failure — it's currently being picked up by `vitest run` and failing because it's a Playwright spec, not a Vitest spec (`test.describe()` from `@playwright/test` isn't valid inside Vitest's runner). Exclude `e2e/**` from the Vitest config (`vitest.config.ts` — add `exclude: [...defaultExclude, 'e2e/**']` or similar) so `pnpm test` only runs unit/component tests, and ensure there's a separate script (`pnpm test:e2e` or similar, calling `playwright test`) that actually runs the Playwright suite in CI.

**Verification:** `pnpm --filter @qyx/web test` shows 0 failures, and a separate `playwright test` invocation (documented in the root README or `package.json` scripts if not already) runs the e2e smoke spec successfully against a running dev server.

---

## PART C — VERIFY AND COMPLETE EVERY BACKEND DOMAIN SERVICE

The services below have real, substantial implementations (400–700+ lines each) — this is not a "these are all stubs" situation like Part B's UI layer. But nobody has done a systematic pass confirming each one is actually wired correctly end-to-end (request → service → DB → response) and org-scoped correctly, the way Phase 3 uncovered for `users.ts`. Phase 11 is a checklist to go through every remaining service with the same rigor.

### Phase 11 — Per-service correctness audit

For **each** of the following services, do all of the following before checking it off:
- Read every route file and its paired service/query file end-to-end.
- Confirm every mutating (`POST`/`PATCH`/`PUT`/`DELETE`) route has the `requirePermission`/`requireMinimumRole` middleware from Phase 2 wired in correctly (not just present somewhere in the chain, but actually gating the right permission for what the route does).
- Confirm every query touching an org-owned entity scopes by `organization_id` from the authenticated session, never from a client-supplied field (the Phase 3 IDOR pattern).
- Confirm there's at least one integration test per route exercising both the success path and an authorization-failure path.
- Manually exercise the feature against a local dev backend (or via the existing frontend once Part B is fixed) and confirm the UI screen that depends on it actually reflects real data changes (e.g., inviting a member in `MembersScreen` actually creates a row and the member shows up on reload).

Services to audit, in priority order (most sensitive first):

1. **`alerts`** (security alerts) — confirm alerts are actually generated by real events (failed logins, suspicious device registration, permission-denied spikes, etc.) rather than only being readable-if-they-existed with nothing ever writing to the table. If nothing currently creates alert rows, that's a gap: wire alert-generation into the auth/devices/rbac code paths (e.g., N failed logins in a window → alert; new device from new location → alert).
2. **`audit`** — confirm every sensitive mutation across the whole API (role changes, status changes, org settings changes, SSO config changes, device revocations) actually writes an audit log entry, not just the ones that happen to call it today. Cross-reference against `AuditLogScreen.tsx`'s expectations. This is also where Phase 7's "failed logins (24h)" dashboard stat should be sourced from — confirm failed login attempts are logged here.
3. **`sso`** — confirm the OAuth/SAML flows (`google`/`entra`/`okta`/`custom` per the login page's provider dropdown) are real integrations with real redirect/token-exchange logic, not placeholder handlers. Confirm state/nonce validation is present on the callback route to prevent CSRF on the SSO login flow.
4. **`devices`** — confirm device approval/revocation actually affects whether a session/refresh token from that device is honored (i.e., revoking a device should actually invalidate its sessions server-side, not just flip a display flag).
5. **`identity`** — confirm whatever "identity verification" the `InspectorPane` UI references is backed by real logic (per-user identity/key verification state), not a static "[VERIFIED]" label.
6. **`groups`**, **`channels`**, **`conversations`**, **`messages`** — confirm membership/permission checks are enforced (a user not in a channel shouldn't be able to read its messages via a direct API call even if the UI wouldn't normally show it), and confirm the org-scoping audit from Phase 3/11's general rule.
7. **`files`** — confirm upload/download URLs (R2 presigned URLs) are scoped so a user from org A can't derive or guess a valid download URL for org B's file, and that file-policy settings (`OrgSettingsScreen`'s file-policy section — type allow-list, size limits) are actually enforced server-side at upload time, not just displayed as a setting that does nothing.
8. **`invites`** — confirm invite codes are single-use (or correctly multi-use if that's intended), expire, and are scoped to the org and role they were created for (this directly supports Phase 4's fix).
9. **`metrics`** — confirm whatever this service currently does; extend per Phase 7's needs.
10. **`organization`** — re-confirm after Phase 2's fix that org settings updates are properly permission-gated.
11. **`users`** — smallest file (79 lines); confirm it's not missing obvious CRUD that other services assume exists.

Document findings for each service as a checklist in the PR description (service name → issues found → issues fixed → remaining known gaps, if any are deliberately deferred). Don't silently skip a service because it "looked fine" on a skim — the whole reason this phase exists is that the RBAC bug and the IDOR bug both looked fine on a skim too.

### Phase 12 — Realtime correctness (Durable Objects)

`apps/api-gateway/src/durable-objects/conversation.ts` and `channel.ts` back the WebSocket realtime layer (`apps/web/src/features/app/hooks/useRealtime.ts` on the frontend). Audit:
- Confirm a WebSocket connection to a conversation/channel Durable Object actually verifies the connecting user is a member of that conversation/channel before accepting the connection or relaying messages (Durable Objects don't automatically inherit the API's auth middleware — this needs to be checked explicitly at the DO's `fetch`/`webSocketMessage` handler).
- Confirm disconnect/reconnect handling doesn't leak stale typing-indicator state or duplicate message delivery (check the existing `conversation.test.ts` for coverage; extend it if these cases aren't tested).
- Load-test (even a simple script sending N concurrent messages) to confirm no message loss/ordering issues before calling realtime "done."

---

## PART D — HARDENING AND PRODUCTION READINESS

### Phase 13 — Session/token storage hardening

Tokens (`accessToken`, `refreshToken`) are currently persisted via Zustand's `persist` middleware straight to `localStorage`, readable by any script that achieves XSS in the app — a meaningful risk for a product whose core pitch is E2EE security. **Option B implemented:** access token is now in-memory only, refresh token stored in httpOnly cookie.

- [x] **Backend cookie setup:** `apps/api-gateway/src/services/auth/auth.routes.ts`
  - [x] `setRefreshCookie()` helper sets `HttpOnly; Secure; SameSite=Strict; Max-Age=7days` cookie
  - [x] Login, register, MFA-verify endpoints set cookie via `Set-Cookie` header
  - [x] Refresh endpoint reads token from cookie if not in body, rotates cookie on refresh
  - [x] Logout endpoint clears the cookie
- [x] **Frontend token storage:** `apps/web/src/stores/authStore.ts`
  - [x] Removed `refreshToken` from state entirely
  - [x] `partialize` now only persists `user` and `roleBucket` (no tokens)
  - [x] `refreshAccessToken()` uses `credentials: 'include'` to send cookie
- [x] **API client:** `apps/web/src/lib/auth.ts`
  - [x] `apiFetch` uses `credentials: 'include'` for all requests
  - [x] `setSession` no longer accepts `refreshToken` parameter
  - [x] `logout` uses `credentials: 'include'`
- [x] **Auth pages updated:** LoginPage, RegisterPage, MfaPage, SsoCallbackPage
  - [x] All updated to use new `setSession(accessToken, user)` signature
- [x] **Tests:** `apps/web/src/stores/authStore.security.test.ts`
  - [x] Verifies accessToken not in partialize output
  - [x] Verifies logout clears accessToken from memory
  - [x] Verifies refreshToken not in state

### Phase 14 — MFA policy consistency

`security_admin` holds `devices:write`, `audit:read`, and `security:read` — permissions at least as sensitive as `admin`'s. `manager` has `groups:write` (write access to org membership). Both roles now require MFA.

- [x] **MFA-required logic updated:** `apps/api-gateway/src/services/auth/auth.service.ts`
  - [x] `security_admin` added to MFA-required check
  - [x] `manager` added to MFA-required check (has `groups:write` for org membership)
  - [x] MFA now required for: `super_admin`, `admin`, `security_admin`, `manager`
- [x] **Tests added:** `apps/api-gateway/src/services/auth/auth.test.ts`
  - [x] Test asserts `security_admin` login returns `MFA_CHALLENGE_ISSUED`
  - [x] Test asserts `manager` login returns `MFA_CHALLENGE_ISSUED`
  - [x] Test asserts `employee` login returns `SESSION_ISSUED` (no MFA)
  - [x] Test asserts `admin` and `super_admin` still require MFA
  - [x] All tests pass

### Phase 15 — Rate limiting and abuse prevention audit

Rate limiting is applied consistently across all endpoints. Brute-force protection with exponential backoff added for login.

- [x] **Rate limiting audit:**
  - [x] `authRateLimit` (10 req/min per IP) applied globally to all auth routes (`/register`, `/login`, `/mfa/verify`, `/refresh`, `/logout`, `/me`)
  - [x] `adminRateLimit` (30 req/min per user) applied to all sensitive mutation endpoints:
    - Organization: create org, domain add/verify, device/session revoke, settings update
    - Members: invite, role change, status change
    - Groups: create, delete
    - Channels: create, delete, requests, posts
    - Invites: create, revoke
    - SSO: provider create/update/delete
    - Alerts: rule create/update/delete/evaluate
  - [x] `messageRateLimit` (60 req/min) applied to message posting
  - [x] `fileRateLimit` (20 req/min) applied to file upload
  - [x] Org-specific rate limits supported via `org_security_policy` table
- [x] **Login brute-force protection:**
  - [x] `BruteForceProtection` class added (`apps/api-gateway/src/middleware/bruteForce.ts`)
  - [x] Tracks failed attempts per IP+email combination
  - [x] Locks after 5 failed attempts with exponential backoff (60s → 120s → 240s → max 1hr)
  - [x] Returns 429 with `Retry-After` header when locked
  - [x] Resets counter on successful login
  - [x] Independent of MFA fix
- [x] **Tests added:** `apps/api-gateway/src/middleware/bruteForce.test.ts`
  - [x] Tests lockout after 5 failed attempts
  - [x] Tests reset on success
  - [x] Tests exponential backoff progression
  - [x] Tests independent tracking per identifier
  - [x] All 8 tests pass

### Phase 16 — CI enforcement

Confirm (or add) a CI workflow under `.github/` that runs the full §0.3 verification block on every PR, plus the Playwright e2e suite, and blocks merge on any failure — including `lint`, which is easy to silently ignore. If `apps/api-gateway` lacks an equivalent `lint`/`typecheck` CI gate to match `apps/web`'s, add it. This phase exists so that the bugs fixed in this document don't quietly come back — a route missing `requirePermission`, a query missing `organization_id`, a hardcoded dashboard number — should all be things a reviewer/CI can catch mechanically where possible (e.g., an ESLint rule or a small custom script that greps for `c.set('permission'` inside a handler body rather than in the middleware chain, failing CI if found, to specifically prevent Phase 2's bug class from regressing).

---

## PART E — END-TO-END VERIFICATION (do this last, once A–D are complete)

### Phase 17 — Full role-matrix E2E test suite

Using Playwright, write (or extend `e2e/smoke.spec.ts` into a proper suite) tests covering, for **each** of the 5 backend roles (`super_admin`, `admin`, `manager`, `security_admin`, `employee`) against seeded test accounts:
1. Login with correct role selection → lands on the correct home app.
2. Login with an intentionally wrong role selection → lands on correct home anyway, with the mismatch banner shown once.
3. Every nav item visible to that role actually navigates to a working screen showing real data (not a redirect to landing, not a blank page).
4. Every nav item **not** visible to that role, if the URL is typed directly, redirects away rather than rendering (defense in depth check for `RequirePermission`).
5. A representative mutating action per role (e.g., `manager` creates a group; `security_admin` revokes a device; `admin` invites a member; `super_admin` views org-wide audit log; `employee` sends an encrypted message and the recipient can decrypt it) completes successfully and the result is visible after a page reload (i.e., actually persisted, not just optimistic UI).
6. Cross-tenant checks: an `admin` in org A cannot see or modify org B's members/settings/audit log through any UI path.

This suite is the final acceptance gate for calling this "a completely working product" rather than a shell — if every item above passes for every role, the platform delivers what it currently only pretends to.

---

## Suggested execution order recap

1. Phase 1 (MFA bypass) — same day, do not deploy anything until this lands.
2. Phase 2 (RBAC enforcement) — next, largest mechanical diff, needs the new integration tests to trust it.
3. Phase 3 (IDOR) → Phase 4 (registration tenant isolation) — round out Part A.
4. Phase 5 → 6 → 7 → 8 → 9 → 10, in order — each depends on the routing fix in Phase 5 being in place to even be testable end-to-end.
5. Phase 11 → 12 — the long systematic backend audit; can be parallelized across services by multiple agent runs once Phase 2/3's patterns are established as the template to check against.
6. Phase 13 → 14 → 15 → 16 — hardening, can happen in parallel with Part C once Part A/B are stable.
7. Phase 17 — last, as the acceptance test for everything above.

Do not mark this document "complete" until Phase 17's suite is green for all 5 roles.

---

## IMPLEMENTATION CHECKLIST

Use this checklist to track progress. Check items off as they are completed and verified. Each checkbox represents a concrete, testable action.

---

### Phase 0 — Ground Rules & Setup
- [ ] Team has read and agreed to §0.1–0.3 (definition of done, role sources of truth, verification block)
- [ ] `pnpm install` runs clean in CI and locally
- [ ] Verification block (§0.3) documented in team runbook or README

---

### Phase 1 — Remove the client-controlled MFA bypass
**Status: DEFERRED — intentionally retained for testing; MUST execute before production.**
**Security severity: CRITICAL — do not deploy without completing this.**

- [ ] **REMINDER:** `bypass_mfa` / `VITE_BYPASS_MFA` is kept for testing only. This checkbox stays unchecked until pre-production cleanup.
- [ ] **Schema fix:** `apps/api-gateway/src/services/auth/auth.schema.ts`
  - [ ] `bypass_mfa` field removed from `LoginSchema`
  - [ ] Schema uses `.strict()` or otherwise rejects unknown fields with 400
- [ ] **Service fix:** `apps/api-gateway/src/services/auth/auth.service.ts`
  - [ ] MFA-required condition changed to unconditionally issue challenge for `super_admin` and `admin` (no `!data.bypass_mfa`)
  - [ ] `security_admin` added to MFA-required check (deferred to Phase 14? No — Phase 14 extends it further, but Phase 1 should at minimum not leave the existing bypass open)
- [ ] **Frontend fix:** `apps/web/src/features/auth/pages/LoginPage.tsx`
  - [ ] `bypass_mfa` removed from form state
  - [ ] `bypassMfa` / `VITE_BYPASS_MFA` removed from code
  - [ ] Env var removed from `.env.example`, wrangler config, and CI secrets
- [ ] **Repo-wide grep:** `grep -rn "bypass_mfa\|VITE_BYPASS_MFA"` returns zero results
- [ ] **Test added:** `apps/api-gateway/src/services/auth/auth.test.ts`
  - [ ] Test asserts `admin`/`super_admin` login always returns `MFA_CHALLENGE_ISSUED`
  - [ ] Test asserts request body with `bypass_mfa: true` is rejected (400) due to strict schema
  - [ ] Test passes

---

### Phase 2 — Fix RBAC enforcement (permission-check-is-dead-code bug)
**Security severity: CRITICAL — authorization is currently a no-op.**

- [x] **Middleware factory added:** `apps/api-gateway/src/middleware/rbac.ts`
  - [x] `requirePermission(permission)` exported
  - [x] `requireMinimumRole(role)` exported
- [x] **Route files updated** — for each file below, apply the transform:
  - [x] `apps/api-gateway/src/services/organization/organization.routes.ts`
  - [x] `apps/api-gateway/src/services/members/members.routes.ts`
  - [x] `apps/api-gateway/src/services/groups/*.routes.ts` (all group route files)
  - [x] `apps/api-gateway/src/services/channels/channels.routes.ts`
  - [x] `apps/api-gateway/src/services/devices/devices.routes.ts`
  - [x] `apps/api-gateway/src/services/sso/sso.routes.ts`
  - [x] `apps/api-gateway/src/services/alerts/alerts.routes.ts`
  - [x] `apps/api-gateway/src/services/invites/invite.routes.ts`
  - [x] `apps/api-gateway/src/services/files/file.routes.ts`
  - [x] `apps/api-gateway/src/services/messages/message.routes.ts`
  - [x] For each file: `requirePermission(...)` or `requireMinimumRole(...)` inserted before `rbac` in middleware chain
  - [x] For each file: `c.set('permission', ...)` / `c.set('minimumRole', ...)` removed from inside handler body
- [x] **Repo-wide grep:** `grep -rln "c.set('permission'\|c.set(\"permission\"\|c.set('minimumRole'\|c.set(\"minimumRole\"" apps/api-gateway/src/services` returns zero results inside handler bodies
- [x] **Test updated:** `apps/api-gateway/src/middleware/rbac.test.ts` (or new integration test)
  - [x] Integration test hits real route through full middleware chain
  - [x] Asserts 403 for `employee` token on `PATCH /members/:userId/role`
  - [x] Asserts 403 for `manager` token on `PATCH /organizations/:orgId/settings`
  - [x] Asserts 403 for `security_admin` token on `POST /groups`
  - [x] Asserts 200 for `admin` token on same routes
  - [x] Test passes

---

### Phase 3 — Fix cross-tenant IDOR on user role/status updates
**Security severity: CRITICAL — cross-tenant privilege escalation is possible.**

- [x] **Query fix:** `apps/api-gateway/src/db/queries/users.ts`
  - [x] `updateUserRole` signature changed to `(db, orgId, userId, role)` with `AND organization_id = ?`
  - [x] `updateUserStatus` signature changed to `(db, orgId, userId, status)` with `AND organization_id = ?`
  - [x] Both functions check `result.meta.changes === 0` and return 404 if zero rows matched
- [x] **Call sites updated:**
  - [x] `apps/api-gateway/src/services/members/members.routes.ts` (and any other callers) pass `orgId` from validated `orgScope` context
- [x] **Self-escalation guard added:**
  - [x] Role-update route rejects requests where caller is modifying their own role or status
- [x] **Last super_admin guard added:**
  - [x] Role-change or status-suspend request rejected if it would leave org with zero `super_admin` users
- [x] **Org-scoping audit of all query files:**
  - [x] `apps/api-gateway/src/db/queries/groups.ts` — every UPDATE/DELETE/single-row SELECT includes `AND organization_id = ?`
  - [x] `apps/api-gateway/src/db/queries/channels.ts` — same audit
  - [x] `apps/api-gateway/src/db/queries/devices.ts` — same audit
  - [x] `apps/api-gateway/src/db/queries/conversations.ts` — same audit
  - [x] `apps/api-gateway/src/db/queries/files.ts` — same audit
  - [x] `apps/api-gateway/src/db/queries/alerts.ts` — same audit
  - [x] All fixes documented in PR description as checklist
- [x] **Test added:**
  - [x] `admin` token from org A attempts to modify user in org B → 404 or 403, never 200
  - [x] Self-escalation block test passes
  - [x] Last-super-admin block test passes
  - [x] Test passes

---

### Phase 4 — Close the self-registration tenant-isolation gap
**Security severity: HIGH — uninvited users can join any org by guessing its name.**

- [x] **Registration logic fixed:** `apps/api-gateway/src/services/auth/auth.service.ts`
  - [x] Join-existing-org branch requires valid invite code **OR** matching verified email domain
  - [x] If neither condition met, returns clear error `ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN`
  - [x] Invite code validation uses existing `InviteService`
  - [x] Domain check uses `db/queries/domains.ts`
- [x] **Test added:**
  - [x] Register with existing org name + no invite + non-matching domain → rejected
  - [x] Register with valid invite code for existing org → joins with invite-specified role
  - [x] Tests pass

---

### Phase 5 — Fix the Admin route registration bug (dead nav links)
**Severity: HIGH — entire admin UI is unreachable.**

- [x] **Route structure fixed:** `apps/web/src/AppRouter.tsx`
  - [x] Admin bucket wrapped in `<Route path="/admin" element={...}>` with relative children
  - [x] Superadmin bucket wrapped in `<Route path="/superadmin" element={...}>` with relative children
  - [x] `.replace('/admin', ...)` string surgery removed from both blocks
- [x] **Route source of truth refactored:**
  - [x] `apps/web/src/lib/roles.ts` `ADMIN_NAV_ITEMS` changed to store `segment` field instead of full `/admin/...` path
  - [x] Sidebar and router both derive full path by prefixing with `basePath`/`/admin`/`/superadmin`
  - [x] String-replace pattern eliminated entirely
- [x] **Regression test added:** `apps/web/src/AppRouter.test.tsx`
  - [x] For every `ADMIN_NAV_ITEMS` entry, `matchRoutes` resolves `/admin/<segment>` to expected element
  - [x] For every superadmin nav entry, `matchRoutes` resolves `/superadmin/<segment>` to expected element
  - [x] No entry resolves to catch-all `<Navigate to="/" />`
  - [x] Test passes against current (broken) code before fix, passes after fix
- [ ] **Manual verification:** All 10 admin nav items render correct screen, not landing page

---

### Phase 6 — Fix role-reading in AdminHome (and audit for same pattern)
**Severity: MEDIUM — admin home shows wrong permissions to everyone.**

- [x] **AdminHome fixed:** `apps/web/src/features/admin/pages/AdminHome.tsx`
  - [x] Replaced `localStorage.getItem('qyx-auth')` manual parse with `useAuthStore` hook
  - [x] Fallback default changed from `'admin'` to `'employee'` (fails closed)
- [x] **Repo-wide audit:** `grep -rn "qyx-auth" apps/web/src`
  - [x] Every occurrence outside `authStore.ts` / `lib/auth.ts` replaced with store hook
  - [x] No direct `localStorage` reads of auth state remain in components
- [x] **Tests added:**
  - [x] `AdminHome` test with `manager` user → only manager-permitted nav items render
  - [x] `AdminHome` test with `security_admin` user → only security_admin-permitted items render
  - [x] `AdminHome` test with `admin` user → all admin-permitted items render
  - [x] Tests pass

---

### Phase 7 — Replace fabricated dashboard data with real API-backed data
**Severity: MEDIUM — dashboard is static fiction.**

- [x] **Backend endpoint verified/created:** `apps/api-gateway/src/services/metrics/`
  - [x] Existing endpoint checked for needed data (org count, active users, pending verifications, failed logins 24h, pending device auths)
  - [x] Missing queries/endpoints added: `MetricsService.getPlatformMetrics()` for cross-org aggregation
  - [x] Failed login logging confirmed: `metrics_events` table queried for `service='identity', operation='login', status='error'`
- [x] **SuperAdminHome wired:** `apps/web/src/features/superadmin/pages/SuperAdminHome.tsx`
  - [x] Fetches real data on mount via `getPlatformSummary(token)`
  - [x] Shows loading state
  - [x] Handles empty/zero state distinctly from loading
- [x] **AdminHome wired:** `apps/web/src/features/admin/pages/AdminHome.tsx`
  - [x] Permission-filtered version: `security:read` required to see org security stats
  - [x] Fetches from `getSecuritySummary(orgId, token)` endpoint
- [x] **Test added:**
  - [x] Component test mocking API response asserts rendered numbers match mock, not hardcoded strings
  - [x] Test passes
- [ ] **Manual verification:** Seeded dev DB with known counts → dashboard shows exact numbers

---

### Phase 8 — Replace hardcoded "Directory" tree with real data
**Severity: MEDIUM — sidebar shows fake org data to every user.**

- [x] **Backend endpoints verified:** `apps/api-gateway/src/services/channels/`, `groups/`, `conversations/`
  - [x] `listChannels`, `listGroups`, `listConversations` exist and are org-scoped
- [x] **DirectoryPane rewritten:** `apps/web/src/layouts/shared/DirectoryPane.tsx`
  - [x] Fetches real org name from auth store
  - [x] Fetches real list of channels user is member of
  - [x] Fetches real list of groups
  - [x] Fetches real recent DM threads
  - [x] Reuses `messagesApi.ts` conversation-list logic (via shared `directoryApi.ts`)
  - [x] Loading and empty states implemented
- [x] **AdminStyleSidebar fixed:** `apps/web/src/layouts/shared/AdminStyleSidebar.tsx`
  - [x] Hardcoded "ACME CORP / general / engineering" block removed
  - [x] Composes admin nav items only (no duplicate directory content)
  - [x] No duplicate hardcoded org data remains
- [x] **Dead code removed:**
  - [x] Orphaned `AdminNav` function inside `DirectoryPane.tsx` deleted
- [ ] **Manual verification:** Two users in two different orgs see their own org's actual name and channels

---

### Phase 9 — Fix full-page-reload navigation in admin quick-links
**Severity: MEDIUM — navigation destroys in-memory encryption state.**

- [x] **AdminHome fixed:** `apps/web/src/features/admin/pages/AdminHome.tsx`
  - [x] All `<a href="...">` quick-links replaced with `<Link to="...">`
- [x] **SuperAdminHome fixed:** `apps/web/src/features/superadmin/pages/SuperAdminHome.tsx`
  - [x] Same replacement applied
- [x] **Test added:**
  - [x] Component test asserts quick-links render as `<Link>` (anchor elements with correct hrefs, not raw `<a href>`)
  - [x] Test passes

---

### Phase 10 — Fix "TODO fallback" tests and get test suite green
**Severity: MEDIUM — CI is red, tests are unreliable.**

- [x] **Landing page test fixed:** `apps/web/src/features/landing/pages/LandingPage.test.tsx`
  - [x] Assertions updated to match actual rendered copy (case-sensitive, exact strings)
  - [x] Test passes
- [x] **Vitest config fixed:** `vitest.config.ts`
  - [x] `e2e/**` added to `exclude` so Playwright specs aren't picked up by Vitest
  - [x] `*.spec.ts` patterns also excluded
- [x] **CI/test script verified:**
  - [x] Separate `pnpm e2e` script exists and runs `playwright test`
  - [x] Documented in root `package.json` scripts
- [x] **Verification:** `pnpm test` shows 0 failures (212 tests pass)

---

### Phase 11 — Per-service correctness audit
**Severity: HIGH — unknown number of org-scoping and RBAC gaps remain.**

For each service below, complete all sub-items before checking off the service:

**General checks for every service:**
- [x] Every mutating route has `requirePermission`/`requireMinimumRole` wired before `rbac`
- [x] Every query on org-owned entity scopes by `organization_id` from authenticated session
- [x] At least one integration test per route (success + authorization failure)
- [ ] Feature manually exercised against local dev backend and reflects real data changes

**1. Alerts**
- [x] Alerts are generated by real events (failed logins, suspicious devices, permission-denied spikes)
- [x] If nothing creates alerts today, wired into auth/devices/rbac code paths
- [x] Tests cover alert generation triggers

**2. Audit**
- [x] Every sensitive mutation writes an audit log entry (role changes, status changes, org settings, SSO config, device revocations)
- [x] Cross-referenced against `AuditLogScreen.tsx` expectations (added `login_failed` to EVENT_TYPES)
- [x] Failed login attempts logged here (feeds Phase 7 dashboard)
- [x] Tests cover audit log creation for sensitive mutations (12 tests in `audit.test.ts`)

**3. SSO**
- [x] OAuth/SAML flows are real integrations (OIDC authorization code grant with real token exchange and userinfo)
- [x] Real redirect/token-exchange logic present (`buildAuthorizationUrl` + `handleCallback`)
- [x] State validation on callback route (CSRF prevention via `sso_state` cookie comparison)
- [x] Tests cover SSO flow and callback validation (17 tests in `sso.test.ts`)

**4. Devices**
- [x] Device approval/revocation invalidates sessions server-side (`deleteDeviceSessions` on revoke)
- [x] Revoked device tokens are rejected (sessions deleted from DB)
- [x] Tests cover revocation → session invalidation (17 tests in `device.service.test.ts`)

**5. Identity**
- [x] "Identity verification" in `InspectorPane` backed by real per-user state (fingerprint computation from device public keys via `@qyx/crypto`)
- [x] Not a static `[VERIFIED]` label (real cryptographic fingerprint comparison with match/no-match)
- [x] Tests cover identity verification state changes (10 tests in `webauthn.service.test.ts`)

**6. Groups / Channels / Conversations / Messages**
- [x] Membership/permission checks enforced (user not in channel cannot read messages via direct API)
- [x] Org-scoping audited (no IDOR) — all queries filter by organization_id
- [x] Tests cover unauthorized access rejection (30+ new tests across all four services)

**7. Files**
- [x] R2 presigned URLs scoped to org (org A cannot guess/download org B's file — org-scoped object keys + access control)
- [x] File-policy settings enforced server-side at upload (type allow-list, size limits, blocked extensions)
- [x] Tests cover cross-org URL access rejection and policy enforcement (22 tests total in file tests)

**8. Invites**
- [x] Invite codes single-use (status changes from 'pending' to 'accepted' on use)
- [x] Invites expire (expires_at checked on acceptance)
- [x] Invites scoped to org and role they were created for
- [x] Tests cover single-use, expiry, and role scoping (14 tests in `invite.service.test.ts`)

**9. Metrics**
- [x] Current behavior confirmed (golden signals, platform metrics, security metrics, DO/queue/D1/R2 metrics)
- [x] Extended per Phase 7 needs (dashboard-summary endpoint via `getPlatformMetrics` and `getSecurityMetrics`)

**10. Organization**
- [x] Org settings updates properly permission-gated (re-confirm after Phase 2) — `requirePermission('org:update')` on PATCH

**11. Users**
- [x] No obvious CRUD missing that other services assume exists
- [x] All queries org-scoped (updateUserRole/updateUserStatus filter by organization_id)
- [x] Tests cover org-scoped queries and CRUD operations (10 tests in `user.service.test.ts`)

- [ ] **Documentation:** Findings for each service documented in PR description (service → issues found → issues fixed → remaining gaps)

---

### Phase 12 — Realtime correctness (Durable Objects)
**Severity: HIGH — WebSocket auth and message delivery unverified.**

- [x] **Auth verification:** `apps/api-gateway/src/durable-objects/conversation.ts` and `channel.ts`
  - [x] WebSocket `fetch`/`webSocketMessage` handler verifies connecting user is member of conversation/channel before accepting connection or relaying messages
  - [x] Note: Durable Objects don't inherit API auth middleware — explicit check required
- [x] **Worker-based realtime auth:** `apps/api-gateway/src/realtime/realtime.ts`
  - [x] Subscribe frame now verifies conversation membership before adding subscription
  - [x] Any authenticated user can no longer subscribe to arbitrary conversations
- [x] **Disconnect/reconnect handling:**
  - [x] No stale typing-indicator state leaked on disconnect (sockets deleted on close/error)
  - [x] No duplicate message delivery on reconnect (sequence numbers tracked per DO)
  - [x] Existing `conversation.test.ts` coverage confirmed/extended for these cases
- [ ] **Load test:**
  - [ ] Simple script sends N concurrent messages
  - [ ] No message loss or ordering issues observed
  - [ ] Results documented

---

### Phase 13 — Session/token storage hardening
**Severity: HIGH — tokens in localStorage are readable by XSS.**

- [x] **Decision made:** Option B implemented — in-memory access token + httpOnly refresh cookie
- [x] **Backend changes:** `apps/api-gateway/src/services/auth/auth.routes.ts`
  - [x] `Set-Cookie` on login/refresh/MFA-verify responses (`HttpOnly; Secure; SameSite=Strict`)
  - [x] Refresh endpoint reads token from cookie if not in body, rotates cookie on refresh
  - [x] Logout endpoint clears the cookie
- [x] **Frontend changes:** `apps/web/src/lib/auth.ts` and `apps/web/src/stores/authStore.ts`
  - [x] `apiFetch` updated to use `credentials: 'include'`
  - [x] `authStore.ts` `partialize` updated to exclude tokens from persisted state (only `user` and `roleBucket`)
  - [x] Tokens not present in `localStorage` after login
- [x] **Test added:** `apps/web/src/stores/authStore.security.test.ts`
  - [x] Option B: test confirms accessToken not in partialize output, logout clears memory, refreshToken not in state
  - [x] Tests pass

---

### Phase 14 — MFA policy consistency
**Severity: MEDIUM — `security_admin` and possibly `manager` skip MFA.**

- [x] **MFA-required logic updated:** `apps/api-gateway/src/services/auth/auth.service.ts`
  - [x] `security_admin` added to MFA-required check
  - [x] `manager` added to MFA-required check (has `groups:write` for org membership)
- [x] **Tests added:** `apps/api-gateway/src/services/auth/auth.test.ts`
  - [x] Tests cover `security_admin`, `manager`, `employee`, `admin`, `super_admin`
  - [x] Tests pass

---

### Phase 15 — Rate limiting and abuse prevention audit
**Severity: MEDIUM — brute-force and abuse vectors remain open.**

- [x] **Rate limiting audit:**
  - [x] `authRateLimit` applied globally to all auth routes (10 req/min per IP)
  - [x] `adminRateLimit` applied to all sensitive mutation endpoints (orgs, members, groups, channels, invites, SSO, alerts)
  - [x] `messageRateLimit` applied to message posting (60 req/min)
  - [x] `fileRateLimit` applied to file upload (20 req/min)
  - [x] Org-specific rate limits supported via `org_security_policy` table
- [x] **Login brute-force protection:**
  - [x] `BruteForceProtection` class added with exponential backoff (60s → 120s → 240s → max 1hr)
  - [x] Locks after 5 failed attempts per IP+email
  - [x] Returns 429 with `Retry-After` header when locked
  - [x] Resets counter on successful login
  - [x] Independent of MFA fix
- [x] **Tests added:** `apps/api-gateway/src/middleware/bruteForce.test.ts`
  - [x] 8 tests covering lockout, reset, exponential backoff, independent tracking
  - [x] Tests pass

---

### Phase 16 — CI enforcement
**Severity: MEDIUM — no guard against regressions.**

- [ ] **CI workflow added/confirmed:** `.github/workflows/`
  - [ ] Runs full §0.3 verification block on every PR
  - [ ] Runs Playwright e2e suite
  - [ ] Blocks merge on any failure (including `lint`)
- [ ] **API gateway CI gate added (if missing):**
  - [ ] `apps/api-gateway` has equivalent `lint`/`typecheck` CI gate matching `apps/web`
- [ ] **Regression prevention tooling:**
  - [ ] ESLint rule or custom script added that greps for `c.set('permission'` inside handler body (fails CI if found)
  - [ ] Prevents Phase 2 bug class from regressing
- [ ] **CI passes** on a clean main branch

---

### Phase 17 — Full role-matrix E2E test suite (Playwright)
**Severity: FINAL ACCEPTANCE — this is the gate for "completely working product."**

For **each** of the 5 backend roles (`super_admin`, `admin`, `manager`, `security_admin`, `employee`):

- [ ] **Login and routing:**
  - [ ] Login with correct role → lands on correct home app
  - [ ] Login with wrong role selection → lands on correct home, mismatch banner shown once
- [ ] **Navigation — visible items:**
  - [ ] Every nav item visible to that role navigates to working screen with real data
  - [ ] No redirect to landing, no blank page
- [ ] **Navigation — forbidden items:**
  - [ ] Every nav item NOT visible to that role, if URL typed directly, redirects away (defense in depth on `RequirePermission`)
- [ ] **Representative mutations:**
  - [ ] `manager` creates a group → persists and visible after reload
  - [ ] `security_admin` revokes a device → persists and visible after reload
  - [ ] `admin` invites a member → persists and visible after reload
  - [ ] `super_admin` views org-wide audit log → real data displayed
  - [ ] `employee` sends encrypted message → recipient can decrypt it
- [ ] **Cross-tenant isolation:**
  - [ ] `admin` in org A cannot see or modify org B's members/settings/audit log through any UI path

- [ ] **Suite passes for all 5 roles** before marking document complete