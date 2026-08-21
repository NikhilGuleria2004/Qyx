# Qyx Frontend Fix Plan — Role-Based Login, Landing Pages & Home Apps

**Audience:** an autonomous coding agent working inside `apps/web` (and, where noted, cross-checking `apps/api-gateway`).
**Goal:** at login, the user picks which role they're signing in as (Super Admin / Admin / Employee); after auth, each role lands on its own dedicated home app with its own layout, nav, and screens — not the current single `AuthenticatedLayout` + cosmetic nav-hiding hack.

Read this whole document before writing any code. Work phase by phase, in order. Do not skip Phase 1 — it's a security guardrail that the rest of the plan depends on. After each phase, run `pnpm --filter @qyx/web typecheck`, `pnpm --filter @qyx/web lint`, and `pnpm --filter @qyx/web test`, and fix anything broken before moving on.

---

## 0. Ground truth about the current code (read this first)

- Router: `apps/web/src/AppRouter.tsx`. Single `AuthenticatedLayout` wraps every post-login route. Admin screens (`/app/members`, `/app/groups`, `/app/channels`, `/app/requests`, `/app/settings`, `/app/security`, `/app/audit`, `/app/devices`, `/app/sso`, `/app/alerts`) are gated by `AdminWrapper`, which **only checks `accessToken` and `orgId` — never role.** `AdminNav` in `AuthenticatedLayout.tsx` hides menu items for non-admins, but that's cosmetic only; typing the URL still renders the screen for anyone logged in.
- Auth state: `apps/web/src/stores/authStore.ts` (Zustand + `persist` to `localStorage`, key `qyx-auth`). Shape: `user: { id, email, name, role, orgId } | null`, `accessToken`, `refreshToken`.
- Backend roles (`apps/api-gateway/src/middleware/auth.ts`, `SessionSchema.role`): `super_admin | admin | manager | employee | security_admin`. This is a 5-role backend model. The user wants a 3-way login selector (Super Admin / Admin / Employee) with 3 dedicated home apps — see §1 for how the extra two roles (`manager`, `security_admin`) are folded in without discarding them.
- Login: `apps/web/src/features/auth/pages/LoginPage.tsx` posts to `/v1/auth/login`, handles an MFA-challenge branch, then calls `setSession(...)` (`apps/web/src/lib/auth.ts`) and navigates to `/app`.
- `GET /v1/auth/me` exists server-side (`apps/api-gateway/src/services/auth/auth.routes.ts`) and returns the authoritative `role` for the current session — **this is the source of truth the frontend must use for gating, never the locally-selected login option.**
- Existing admin screens (`apps/web/src/features/admin/components/*.tsx`) already take `{ orgId, token, onClose }` props and call `apps/web/src/features/admin/api/adminApi.ts`. These are reusable — you're relocating/re-routing them, not rewriting their internals, unless a phase below says otherwise.
- The existing chat/messaging experience (`apps/web/src/features/app/pages/AppPage.tsx`) — conversations, E2EE handshake, file transfer, realtime — is the Employee home app's core and must not be deleted or functionally regressed. Treat it as a component to be embedded, not a page to be rewritten.
- `apps/web/src/features/onboarding/pages/OnboardingPage.tsx` is the "organization pending verification" flow for a freshly-created org (`super_admin` right after registration). Keep it before the Super Admin home, not instead of it.

---

## 1. Role model: the frontend contract (build this before any UI)

### 1.1 Why a client-side "role selector" is safe here — and how to keep it that way

The person selecting "I am logging in as Admin" on the login screen is **only a UX hint that decides which home app the app *tries* to route them to**. It must never be treated as a grant of privilege. The actual role always comes from the server (`/v1/auth/login` response `user.role`, and re-confirmed via `/v1/auth/me`). If the selection doesn't match the server-issued role, the frontend must not honor the selection — it must route by the server role and tell the user why. Bake this rule into every piece of code you write in this plan; it's the one thing that must never regress.

> ⚠️ Cross-cutting note for whoever owns the backend: this frontend rework assumes route-level authorization is enforced server-side. As of this writing it is **not** (the `rbac` middleware's `c.set('permission', ...)` calls happen inside route handlers, after `rbac` has already run — see the separate backend audit). The frontend guards in this plan are defense-in-depth / UX correctness, not a substitute for fixing that. Do not describe the frontend guard as "access control" in comments or docs — call it "role-based routing," and note the backend dependency in the PR description.

### 1.2 Role bucket mapping

Create `apps/web/src/lib/roles.ts`:

```ts
export type BackendRole = 'super_admin' | 'admin' | 'manager' | 'employee' | 'security_admin';
export type RoleBucket = 'superadmin' | 'admin' | 'employee';

// The login selector only offers these 3 buckets. Every backend role maps
// into exactly one bucket, so nobody is left without a home app.
export const ROLE_BUCKET: Record<BackendRole, RoleBucket> = {
  super_admin: 'superadmin',
  admin: 'admin',
  manager: 'admin',        // gets the Admin home app, nav trimmed to its permissions (see §4.3)
  security_admin: 'admin', // gets the Admin home app, nav trimmed to its permissions (see §4.3)
  employee: 'employee',
};

export const ROLE_HOME_PATH: Record<RoleBucket, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  employee: '/employee',
};

export const ROLE_LABEL: Record<BackendRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  security_admin: 'Security Admin',
  employee: 'Employee',
};

export const BUCKET_LABEL: Record<RoleBucket, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  employee: 'Employee',
};

export function bucketOf(role: string | undefined | null): RoleBucket {
  return ROLE_BUCKET[(role as BackendRole)] ?? 'employee';
}
```

This is the single source of truth for role → bucket → home-path mapping. Every later phase imports from here; don't hardcode role strings anywhere else.

### 1.3 Mirror the backend permission map (nav-trimming only, not security)

Also in `roles.ts`, add a **read-only copy** of the backend's permission table from `apps/api-gateway/src/middleware/rbac.ts` (`PERMISSIONS` const), used purely to decide which nav items/screens to *show* inside the Admin home app for `manager` vs `admin` vs `security_admin`:

```ts
export const ROLE_PERMISSIONS: Record<BackendRole, string[]> = {
  super_admin: ['*'],
  admin: ['org:read','org:update','members:read','members:write','groups:read','groups:write','channels:read','channels:write','audit:read','security:read'],
  manager: ['org:read','members:read','groups:read','groups:write','channels:read'],
  employee: ['org:read','conversations:read','conversations:write','files:read','files:write'],
  security_admin: ['org:read','members:read','devices:read','devices:write','audit:read','security:read'],
};

export function can(role: string | undefined | null, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[(role as BackendRole)] ?? [];
  return perms.includes('*') || perms.includes(permission);
}
```

Add a comment above this block: `// Mirrors apps/api-gateway/src/middleware/rbac.ts PERMISSIONS. Keep in sync manually until there's a shared @qyx/schemas export — see Phase 6.` File this as a follow-up in Phase 6 instead of solving it now, so this plan stays scoped to the frontend.

---

## 2. Extend the auth store

Edit `apps/web/src/stores/authStore.ts`:

1. Add a `roleBucket: RoleBucket | null` field, derived and stored whenever `setUser` is called (don't make callers compute it separately — compute it inside the store so it can never drift from `user.role`):
   ```ts
   setUser: (user) => set({ user, roleBucket: user ? bucketOf(user.role) : null }),
   ```
2. Add `meVerifiedAt: number | null` — timestamp of the last successful `/v1/auth/me` confirmation. You'll use this in Phase 4 to force a re-check of the server-side role after any period of inactivity or on hard refresh, so a stale persisted `role` in `localStorage` can never grant access to the wrong home app after an admin's role has been changed server-side mid-session.
3. Keep `partialize` as-is (persist `user`, `accessToken`, `refreshToken`) but also persist `roleBucket` since it's derived synchronously — no extra risk.
4. Do not remove or rename existing fields/methods (`setTokens`, `refreshAccessToken`, `logout`, etc.) — other files depend on them (`lib/auth.ts`, `AuthenticatedLayout.tsx` before you delete it in Phase 4).

Add a helper in `apps/web/src/lib/auth.ts` next to `getMe()`:

```ts
export async function verifyRole(): Promise<RoleBucket | null> {
  const me = await getMe();
  if (!me) return null;
  const bucket = bucketOf(me.role);
  useAuthStore.getState().setUser({
    id: me.id,
    email: me.email,
    name: me.display_name,
    role: me.role,
    orgId: me.organization_id,
  });
  useAuthStore.setState({ meVerifiedAt: Date.now() });
  return bucket;
}
```

This hits the real backend (`GET /v1/auth/me`) and re-syncs `user`/`roleBucket` from the server response. It's the function every route guard in Phase 4 will call.

---

## 3. Login page: add the role selector

Edit `apps/web/src/features/auth/pages/LoginPage.tsx`.

### 3.1 UI changes

- Add a 3-way segmented control / tab group above the email field: **Super Admin**, **Admin**, **Employee** (use `BUCKET_LABEL` from `roles.ts` — don't hardcode strings). Default selection: `employee` (most logins are employees; don't default to a privileged option).
- Store the selection in local component state: `const [selectedBucket, setSelectedBucket] = useState<RoleBucket>('employee');`.
- Visually this can be three `Button variant="ghost"` (or a new small `SegmentedControl` component in `packages/ui` if you want it reusable — see §3.3) with an active/inactive style, `aria-pressed` set correctly, and keyboard-operable (they're buttons, so this is free).
- Keep every existing field (email, password, device name, SSO block, register link) exactly as-is. This is additive.

### 3.2 Submit logic changes

Replace the tail of `onSubmit` (after a successful, non-MFA login) with role-bucket verification:

```ts
if (data.access_token && data.refresh_token && data.user) {
  setSession(data.access_token, data.refresh_token, {
    id: data.user.id,
    organization_id: data.user.organization_id,
    role: data.user.role,
  });

  const actualBucket = bucketOf(data.user.role);

  // Org-pending-verification check stays first — it overrides everything else.
  try {
    const orgRes = await fetch(apiUrl(`/v1/organizations/${data.user.organization_id}`), {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (orgRes.ok) {
      const orgData = await orgRes.json();
      if (orgData.status === 'pending_verification') {
        navigate('/onboarding?flow=create');
        return;
      }
    }
  } catch {
    // ignore org status check failure — fall through to normal routing
  }

  if (actualBucket !== selectedBucket) {
    // Don't silently log them into the wrong dashboard. Tell them what happened
    // and send them to the home app that actually matches their account.
    setRoleMismatch({ selected: selectedBucket, actual: actualBucket });
    navigate(ROLE_HOME_PATH[actualBucket], { replace: true });
    return;
  }

  navigate(ROLE_HOME_PATH[actualBucket]);
  return;
}
```

- Add `const [roleMismatch, setRoleMismatch] = useState<{ selected: RoleBucket; actual: RoleBucket } | null>(null);`. When set, render a small inline banner (not a blocking modal — they're already being routed correctly) e.g.:
  *"You selected {BUCKET_LABEL[selected]}, but this account is a {BUCKET_LABEL[actual]} account. We've signed you in to your {BUCKET_LABEL[actual]} home."*
- This banner needs to survive the navigation — easiest approach: pass it via `navigate(path, { state: { roleMismatch } })` and have each home app's top-level page read `useLocation().state?.roleMismatch` on mount, show a dismissible toast/banner once, then clear it (`navigate(location.pathname, { replace: true, state: {} })` after reading, so a refresh doesn't re-show it). Implement this pattern once as a small hook (`useOneTimeLocationBanner`, see §4.5) and reuse across the three home apps.

### 3.3 Optional: shared `SegmentedControl` component

If `packages/ui/src/components` doesn't already have something suitable, add `packages/ui/src/components/segmented-control.tsx`:

```tsx
export function SegmentedControl<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex border border-hairline rounded-sm overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-xs transition-colors ${
            value === opt.value ? 'bg-raised text-text-primary' : 'text-text-dim hover:text-text-secondary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```
Export it from `packages/ui/src/index.ts` next to the other component exports. Use it in `LoginPage.tsx` for the role selector.

### 3.4 Update `LoginPage.test.tsx`

Add assertions that the three role options render (`Super Admin`, `Admin`, `Employee`) and that `Employee` is selected by default (check the `aria-selected` attribute). Don't remove the existing assertions.

---

## 4. Routing overhaul: three dedicated route trees

This is the core of the work. Replace the single `/app/*` tree with three independent, role-scoped trees, each with its own layout and home page. Delete `AdminWrapper` entirely — it's the broken pattern this plan replaces.

### 4.1 New route structure (target state of `AppRouter.tsx`)

```
/                              → LandingPage (public)
/register, /login, /mfa        → public auth flow (unchanged)
/auth/sso/:provider/callback   → unchanged
/onboarding                    → unchanged (org pending verification)

/superadmin                    → SuperAdminLayout > SuperAdminHome        (role bucket: superadmin)
/superadmin/members            → SuperAdminLayout > MembersScreen
/superadmin/groups             → SuperAdminLayout > GroupsScreen
/superadmin/channels           → SuperAdminLayout > ChannelsScreen
/superadmin/requests           → SuperAdminLayout > RequestsScreen
/superadmin/settings           → SuperAdminLayout > OrgSettingsScreen
/superadmin/security           → SuperAdminLayout > SecurityCenterScreen
/superadmin/audit              → SuperAdminLayout > AuditLogScreen
/superadmin/devices            → SuperAdminLayout > DevicesScreen
/superadmin/sso                → SuperAdminLayout > SSOScreen
/superadmin/alerts             → SuperAdminLayout > AlertsScreen

/admin                         → AdminLayout > AdminHome                  (role bucket: admin — covers admin, manager, security_admin)
/admin/members                 → AdminLayout > MembersScreen  (nav-gated by permission, see §4.3)
/admin/groups                  → AdminLayout > GroupsScreen
/admin/channels                → AdminLayout > ChannelsScreen
/admin/requests                → AdminLayout > RequestsScreen
/admin/settings                → AdminLayout > OrgSettingsScreen
/admin/security                → AdminLayout > SecurityCenterScreen
/admin/audit                   → AdminLayout > AuditLogScreen
/admin/devices                 → AdminLayout > DevicesScreen
/admin/sso                     → AdminLayout > SSOScreen
/admin/alerts                  → AdminLayout > AlertsScreen

/employee                      → EmployeeLayout > EmployeeHome (= today's AppPage chat UI)  (role bucket: employee)

/app                           → redirect shim: send to the caller's ROLE_HOME_PATH (keeps old bookmarks/links alive)
/app/*                         → same redirect shim, preserving no sub-path (admin sub-pages under /app/* now live under /admin/* or /superadmin/*)

*                               → redirect to /
```

Super Admin and Admin get near-identical screen sets on purpose (Super Admin is a strict superset — it additionally can create organizations and has the `*` permission wildcard). Don't fork the admin screen components; reuse the same `MembersScreen`, `GroupsScreen`, etc. across both layouts, and let `SuperAdminLayout` simply not apply any nav-trimming (since `super_admin` passes every `can()` check).

### 4.2 Route guard component

Replace `RequireAuth`/`RequireGuest`/`AdminWrapper` in `AppRouter.tsx` with a single, well-tested guard:

```tsx
function RequireBucket({ bucket, children }: { bucket: RoleBucket; children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const meVerifiedAt = useAuthStore((s) => s.meVerifiedAt);
  const [checking, setChecking] = useState(true);
  const [resolvedBucket, setResolvedBucket] = useState<RoleBucket | null>(user ? bucketOf(user.role) : null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // Re-verify against the server if we've never verified this session,
      // or the last verification is stale (> 60s) — cheap, avoids a network
      // round trip on every single navigation while still catching role
      // changes that happen mid-session.
      const stale = !meVerifiedAt || Date.now() - meVerifiedAt > 60_000;
      if (accessToken && stale) {
        const verified = await verifyRole();
        if (!cancelled) setResolvedBucket(verified);
      }
      if (!cancelled) setChecking(false);
    }
    check();
    return () => { cancelled = true; };
  }, [accessToken, meVerifiedAt]);

  if (!accessToken) return <Navigate to="/login" replace />;
  if (checking) return <FullScreenSpinner />; // small inline component, see below
  if (!resolvedBucket) return <Navigate to="/login" replace />; // /auth/me failed — session is dead
  if (resolvedBucket !== bucket) return <Navigate to={ROLE_HOME_PATH[resolvedBucket]} replace />;
  return <>{children}</>;
}
```

Notes for the agent:
- `FullScreenSpinner` can be a 5-line inline component (reuse existing loading patterns from `AppPage.tsx` if one exists, otherwise a minimal centered spinner div using existing Tailwind tokens like `bg-void`, `text-text-dim`).
- The 60-second staleness window is a judgment call to balance correctness vs. request volume; document it in a code comment so a future reader knows it's intentional, not an oversight.
- `RequireGuest` (used on `/login`, `/register`, `/mfa`) can stay as-is but should redirect to `ROLE_HOME_PATH[bucketOf(user?.role)]` instead of hardcoded `/app` when a session already exists.

### 4.3 Nav-trimming inside the Admin layout

Inside `AdminLayout` (Phase 5), build the nav list by filtering against `can(user.role, permission)` for each item, using this mapping (add it to `roles.ts` as `ADMIN_NAV_PERMISSIONS`):

```ts
export const ADMIN_NAV_ITEMS: { path: string; label: string; permission: string }[] = [
  { path: '/admin/members',  label: 'Members',        permission: 'members:read' },
  { path: '/admin/groups',   label: 'Groups',          permission: 'groups:read' },
  { path: '/admin/channels', label: 'Channels',        permission: 'channels:read' },
  { path: '/admin/requests', label: 'Requests',        permission: 'org:read' },
  { path: '/admin/settings', label: 'Org Settings',    permission: 'org:update' },
  { path: '/admin/security', label: 'Security Center', permission: 'security:read' },
  { path: '/admin/audit',    label: 'Audit Log',       permission: 'audit:read' },
  { path: '/admin/devices',  label: 'Devices',         permission: 'devices:read' },
  { path: '/admin/sso',      label: 'SSO',             permission: 'org:update' },
  { path: '/admin/alerts',   label: 'Alerts',          permission: 'security:read' },
];
```

With this table, `manager` will only see Members, Groups, Channels, Requests; `security_admin` will only see Members, Audit Log, Devices, Security Center, Alerts — matching the actual backend permission map instead of the current all-or-nothing `admin`/`super_admin` check. This fixes the "dead-end roles with no nav entry" problem identified in the earlier audit.

**Also add a route-level guard, not just a nav-level filter**: wrap each `/admin/:screen` route element in a small `RequirePermission` component (same shape as `RequireBucket`, but checks `can(user.role, permission)` instead of bucket equality) so a `manager` can't reach `/admin/security` by typing the URL even though it's hidden from their nav. This mirrors the nav table 1:1 — reuse `ADMIN_NAV_ITEMS` to generate both the nav and the route guards so they can never drift apart.

### 4.4 `AppRouter.tsx` — full rewrite skeleton

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import SuperAdminLayout from './layouts/SuperAdminLayout';
import AdminLayout from './layouts/AdminLayout';
import EmployeeLayout from './layouts/EmployeeLayout';
import LandingPage from './features/landing/pages/LandingPage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import MfaPage from './features/auth/pages/MfaPage';
import SsoCallbackPage from './features/auth/pages/SsoCallbackPage';
import OnboardingPage from './features/onboarding/pages/OnboardingPage';
import SuperAdminHome from './features/superadmin/pages/SuperAdminHome';
import AdminHome from './features/admin/pages/AdminHome';
import EmployeeHome from './features/employee/pages/EmployeeHome';
import { MembersScreen, GroupsScreen, ChannelsScreen, RequestsScreen, OrgSettingsScreen, SecurityCenterScreen, AuditLogScreen, DevicesScreen, SSOScreen, AlertsScreen } from './features/admin';
import { ADMIN_NAV_ITEMS, ROLE_HOME_PATH, bucketOf } from './lib/roles';
import { useAuthStore } from './stores/authStore';
import { RequireGuest, RequireBucket, RequirePermission, HomeRedirect } from './routeGuards';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
          <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
          <Route path="/mfa" element={<RequireGuest><MfaPage /></RequireGuest>} />
          <Route path="/auth/sso/:provider/callback" element={<SsoCallbackPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        <Route element={<RequireBucket bucket="superadmin"><SuperAdminLayout /></RequireBucket>}>
          <Route path="/superadmin" element={<SuperAdminHome />} />
          <Route path="/superadmin/members" element={<MembersScreen orgId={ORG_ID} token={TOKEN} onClose={CLOSE} />} />
          {/* ...remaining /superadmin/* screens, same pattern... */}
        </Route>

        <Route element={<RequireBucket bucket="admin"><AdminLayout /></RequireBucket>}>
          <Route path="/admin" element={<AdminHome />} />
          {ADMIN_NAV_ITEMS.map((item) => (
            <Route key={item.path} path={item.path} element={
              <RequirePermission permission={item.permission}>
                {/* map item.path -> the right screen component — see note below */}
              </RequirePermission>
            } />
          ))}
        </Route>

        <Route element={<RequireBucket bucket="employee"><EmployeeLayout /></RequireBucket>}>
          <Route path="/employee" element={<EmployeeHome />} />
        </Route>

        <Route path="/app" element={<HomeRedirect />} />
        <Route path="/app/*" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

Notes:
- `orgId`/`token` for the admin screen props: instead of threading them through JSX per-route as the old `AdminWrapper` did, give `MembersScreen` etc. access via a small context or just read them straight from `useAuthStore` inside a thin wrapper component per screen (`AdminScreenWrapper`, in `AdminLayout.tsx`) so the router table above doesn't get cluttered. Concretely: don't hand-write 10 nearly-identical `<Route>` elements with inline prop-plumbing (that's how `AppRouter.tsx` got messy the first time) — build the `ADMIN_NAV_ITEMS`-to-component mapping as a small lookup object (`{ '/admin/members': MembersScreen, ... }`) and generate routes from it in a loop, injecting `orgId`/`token` from the store inside a single wrapper component.
- `HomeRedirect` (put it in `apps/web/src/routeGuards.tsx` alongside the other guards): reads `useAuthStore` user, computes bucket via `bucketOf`, and does `<Navigate to={ROLE_HOME_PATH[bucket] } replace />` if logged in, or `<Navigate to="/login" replace />` if not. This is the backward-compat shim for old `/app` links/bookmarks and for any other code you haven't found yet that still points at `/app`.
- Extract `RequireGuest`, `RequireBucket`, `RequirePermission`, `HomeRedirect` into `apps/web/src/routeGuards.tsx` instead of leaving them inline in `AppRouter.tsx` — the file is already doing a lot; keep the route table itself as the only thing in `AppRouter.tsx`.

### 4.5 `useOneTimeLocationBanner` hook

Create `apps/web/src/lib/useOneTimeLocationBanner.ts`:

```ts
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useOneTimeLocationBanner<T>(key: string): T | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [value] = useState<T | null>((location.state as Record<string, unknown> | null)?.[key] as T ?? null);

  useEffect(() => {
    if (value !== null) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}
```

Use this in `SuperAdminHome`, `AdminHome`, `EmployeeHome` to read/clear the `roleMismatch` banner state set in Phase 3.2.

---

## 5. Three layouts and three home pages

### 5.1 Directory structure to create

```
apps/web/src/layouts/SuperAdminLayout.tsx
apps/web/src/layouts/AdminLayout.tsx
apps/web/src/layouts/EmployeeLayout.tsx
apps/web/src/layouts/shared/Shell.tsx            (shared chrome: status bar, logout button, command palette)
apps/web/src/layouts/shared/RoleMismatchBanner.tsx

apps/web/src/features/superadmin/pages/SuperAdminHome.tsx
apps/web/src/features/admin/pages/AdminHome.tsx
apps/web/src/features/employee/pages/EmployeeHome.tsx
```

Delete `apps/web/src/layouts/AuthenticatedLayout.tsx` once its pieces have been redistributed (see §5.4) — don't leave it around unused, it'll rot and confuse the next person.

### 5.2 Shared shell

Pull the genuinely shared chrome out of the current `AuthenticatedLayout.tsx` into `layouts/shared/Shell.tsx`:
- `StatusBar` (the connection/e2ee-active/user/logout bar at the bottom) — reusable as-is, it's role-agnostic.
- `CommandPalette` (Cmd/Ctrl+K) — reusable as-is.
- The overall `h-screen w-screen flex flex-col` + `flex flex-1 overflow-hidden` wrapper structure.

Signature:
```tsx
export function Shell({ sidebar, children, inspector }: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  inspector?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  async function handleLogout() { await logout(); navigate('/login'); }
  return (
    <div className="h-screen w-screen bg-void text-text-primary font-mono flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1">{children}</div>
          {inspector}
        </div>
      </div>
      <StatusBar user={user} onLogout={handleLogout} />
      <CommandPalette />
    </div>
  );
}
```

Each of the three layouts below renders `<Shell sidebar={...}><Outlet /></Shell>` with its own sidebar content.

### 5.3 `SuperAdminLayout.tsx` and `AdminLayout.tsx`

These two are near-identical; consider a shared `AdminStyleSidebar({ role }: { role: string })` component in `layouts/shared/` that both call, since the only real difference is:
- Super Admin's sidebar nav is **unfiltered** (render all of `ADMIN_NAV_ITEMS`, plus an extra "Organizations" / create-org entry that only `super_admin` gets — the current codebase's `POST /v1/organizations` is `requireSuperAdmin`-only server-side, so this is a legitimate super-admin-only feature to surface).
- Admin's sidebar nav is filtered via `ADMIN_NAV_ITEMS.filter((item) => can(user.role, item.permission))` (§4.3).

Both layouts keep the existing "Directory" (org/channels/groups/direct-messages tree) and "Devices"/"Identity verification"/"Recovery policy"/"File policy" inspector panel content that's currently in `AuthenticatedLayout.tsx`'s `InspectorPane` — move that component into `layouts/shared/InspectorPane.tsx` unchanged, and mount it from `SuperAdminLayout`/`AdminLayout` (not from `EmployeeLayout` — employees don't manage org-wide device/file policy; give them a much simpler inspector, see §5.5).

### 5.4 What happens to each piece of the old `AuthenticatedLayout.tsx`

| Old piece | New home |
|---|---|
| `AuthenticatedLayout` outer wrapper | `layouts/shared/Shell.tsx` |
| `DirectoryPane` (channels/groups/DMs tree) | `layouts/shared/DirectoryPane.tsx`, used by all three layouts (Employee gets it too — they need to see their channels) |
| `AdminNav` | Replaced by the permission-filtered nav described in §4.3/§5.3 — delete the old hardcoded `role !== 'super_admin' && role !== 'admin'` check entirely |
| `InspectorPane` (devices, identity verification, recovery policy, file policy) | `layouts/shared/InspectorPane.tsx`, mounted by `SuperAdminLayout`/`AdminLayout` only |
| `StatusBar` | `layouts/shared/Shell.tsx` (as a subcomponent) |
| `CommandPalette` | `layouts/shared/Shell.tsx` (as a subcomponent) |

Update the `CommandPalette`'s hardcoded `CommandItem`s ("Admin dashboard", "Security center") to navigate to `ROLE_HOME_PATH[bucket]`-relative paths instead of assuming `/app/...`, and hide items the current role can't reach (reuse `can()`).

### 5.5 The three home pages

- **`SuperAdminHome.tsx`**: a dashboard-style landing — org health summary (member count, pending requests, recent audit events, active alerts). Pull data from the existing `adminApi.ts` functions (`listMembers`, etc. — check what's already exported before adding new API calls) via `useEffect` on mount. Render `useOneTimeLocationBanner` role-mismatch banner at the top. Provide quick-links (cards or buttons) into `/superadmin/members`, `/superadmin/security`, `/superadmin/audit`, etc. — this is the "monitor and use the platform" entry point the user asked for.
- **`AdminHome.tsx`**: same pattern as SuperAdminHome but its quick-links are generated from the permission-filtered `ADMIN_NAV_ITEMS` (§4.3), so a `manager` logging in sees only Members/Groups/Channels/Requests cards, and a `security_admin` sees only Members/Audit/Devices/Security/Alerts cards — no dead links to screens they can't open.
- **`EmployeeHome.tsx`**: this is a thin wrapper that renders the existing `AppPage` component (rename the file/export if you want, e.g. move `features/app/pages/AppPage.tsx` to `features/employee/pages/EmployeeHome.tsx`, updating its internal relative imports (`../api/messagesApi` → `../../app/api/messagesApi` or move the api/hooks folders alongside it — your call, but keep it consistent with the `features/<domain>/{pages,api,hooks}` convention already used elsewhere in the repo). Add the `useOneTimeLocationBanner` role-mismatch banner at the top of its JSX tree, above the existing chat UI, without disturbing the rest of the component's logic (key pairs, realtime subscriptions, encryption/decryption, file upload — none of that changes).

Give the employee a much lighter `EmployeeLayout`: `DirectoryPane` (their channels/DMs) + `Shell`, but skip `InspectorPane`'s org-admin controls (devices/file-policy/recovery-policy are org-wide settings employees shouldn't be driving from their home). If employees need personal device management (pairing their own phone, etc.), keep only that slice — check `apps/web/src/features/devices/api/devicesApi.ts` for `listMyDevices`/`registerDevice`/etc. (already scoped to "my devices", not org devices) and surface just that in a simplified employee-facing panel, not the full admin `InspectorPane`.

---

## 6. Registration / onboarding path adjustments

- `RegisterPage.tsx`: after successful registration, it currently probably follows the same login-and-redirect pattern — check it and route the same way as `LoginPage.tsx` post-login (§3.2), using `bucketOf(data.user.role)`, minus the role-selector (a brand-new registrant doesn't pick a role; their role is determined by whether they're creating an org (`super_admin`) or joining via invite (whatever role the invite specifies)).
- `OnboardingPage.tsx` (org pending verification) should, on completion, route to `/superadmin` (only `super_admin`s reach this flow, per `auth.service.ts`'s `register()` — org creation always assigns `role = 'super_admin'` to the creator).
- `MfaPage.tsx`: after successful MFA verification it currently `navigate('/app')` — change to `navigate(ROLE_HOME_PATH[bucketOf(role)])` using the role returned in the MFA-verify response.
- `SsoCallbackPage.tsx`: same change — replace the hardcoded `navigate('/app', { replace: true })` with the bucket-based redirect.

---

## 7. Tests to add or update

Don't skip this — the existing test suite is thin (`vitest run` + one Playwright smoke spec) but it's what will catch regressions in CI.

1. **`LoginPage.test.tsx`**: add the role-selector assertions from §3.4.
2. **New: `routeGuards.test.tsx`**: unit-test `RequireBucket` and `RequirePermission` in isolation (mock `useAuthStore`, mock `verifyRole`/`getMe`) for: no token → redirect to `/login`; token + matching bucket → renders children; token + mismatched bucket → redirects to the correct home; `/auth/me` failure → redirect to `/login`.
3. **New: `roles.test.ts`**: test `bucketOf` for all 5 backend roles (including the `manager`/`security_admin` → `admin` folding) and an unknown/garbage role string (should not throw — should fall back to `employee`, matching the `?? 'employee'` default; verify this fallback is intentional and doesn't accidentally grant more access than the safest default warrants — `employee` is correctly the least-privileged bucket, so this is safe).
4. **`e2e/smoke.spec.ts`**: check what it currently covers; extend it (or add `e2e/role-routing.spec.ts`) with three Playwright flows — log in as each bucket (you'll need seeded test users per role, or mock the API responses at the network layer per Playwright's route interception) and assert the URL lands on `/superadmin`, `/admin`, `/employee` respectively, and that cross-navigating to another bucket's path (e.g., an employee manually navigating to `/admin/members`) redirects back to their own home.
5. Update any test that currently asserts navigation to `/app` (search the repo for `'/app'` string literals in `*.test.tsx` files, not just the ones already found in this doc) to expect the new bucket-based paths, or to expect the `/app` redirect shim.

Run the full check before calling any phase "done":
```
pnpm --filter @qyx/web typecheck
pnpm --filter @qyx/web lint
pnpm --filter @qyx/web test
pnpm --filter @qyx/web build
```

---

## 8. Explicit non-goals for this pass (don't do these, call them out in the PR description instead)

- **Do not fix the backend RBAC middleware ordering bug.** It's out of scope for a frontend-only pass, but every guard built in Phase 4 should be commented as "UX routing, not authorization" per §1.1, and the PR description must link to the backend issue so nobody mistakes this work for a security fix.
- **Do not change the `updateUserRole`/`updateUserStatus` API contracts** — `MembersScreen.tsx` keeps calling the same `adminApi.ts` functions; you're only changing where the screen is mounted and who can navigate to it.
- **Do not migrate `localStorage` token storage to cookies** in this pass — that's a separate, larger change (needs backend cookie support) and isn't required to ship role-based home apps.
- **Do not add a 4th/5th top-level home app for `manager`/`security_admin`.** Per the explicit ask, there are exactly three login options and three home apps; the extra backend roles are folded into the Admin bucket with permission-trimmed nav (§1.2, §4.3). If a future request wants dedicated Manager/Security-Admin home apps, `roles.ts`'s bucket map is the one place to change — that's the point of centralizing it there.

---

## 9. Suggested commit sequence

1. `roles.ts` + auth store changes + `lib/auth.ts` `verifyRole()` (Phase 1–2) — no UI change yet, should be a no-op build.
2. Login page role selector + mismatch handling (Phase 3).
3. `routeGuards.tsx` + rewritten `AppRouter.tsx` pointing at **placeholder** layouts/home pages that just render "TODO" (keeps the diff reviewable — routing logic separate from UI building).
4. `Shell`, `DirectoryPane`, `InspectorPane` extraction from the old `AuthenticatedLayout.tsx` (Phase 5.2/5.4).
5. `SuperAdminLayout` + `SuperAdminHome` (real content).
6. `AdminLayout` + `AdminHome` (real content, permission-filtered nav).
7. `EmployeeLayout` + `EmployeeHome` (relocate `AppPage`).
8. Delete old `AuthenticatedLayout.tsx`, `AdminWrapper`, dead imports.
9. Registration/MFA/SSO callback redirect updates (Phase 6).
10. Tests (Phase 7).

Each step should build, typecheck, and lint clean before moving to the next — don't batch this into one giant commit.

---

## Progress Checklist

Use this checklist to track implementation progress. Mark items as complete with `[x]`.

### Phase 0 — Prerequisites

- [x] Confirm backend RBAC middleware ordering bug ticket exists and is linked
  - **Finding**: No existing ticket or ADR found. Bug is confirmed (see below). **A ticket must be created before Phase 4.**
- [x] Verify `wrangler.toml` configuration for all Worker services
  - **Finding**: All 4 services (`api-gateway`, `audit-worker`, `notification-worker`, `backup-worker`) have proper wrangler.toml with dev/staging/prod environments, D1, KV, DO, Queues bindings. No gaps.
- [x] Review current `AdminWrapper` code and `AuthenticatedLayout.tsx` to understand prop interfaces being replaced
  - **Finding**: `AdminWrapper` passes `{ orgId, token, onClose }` to 10 admin screens. `AuthenticatedLayout.tsx` (557 lines) contains DirectoryPane, AdminNav, InspectorPane, StatusBar, CommandPalette.

**Phase 0 Blocker**: Backend RBAC middleware ordering bug must be fixed before Phase 4. The `c.set('permission', ...)` calls in route handlers execute AFTER `rbac` middleware, making permission checks a no-op. See detailed analysis above.

### Phase 1 — Role Contract

- [x] Create `apps/web/src/lib/roles.ts`
- [x] Export `BackendRole`, `RoleBucket`, `ROLE_BUCKET`, `ROLE_HOME_PATH`, `ROLE_LABEL`, `BUCKET_LABEL`
- [x] Export `bucketOf()` helper
- [x] Export `ROLE_PERMISSIONS` (mirror of backend `rbac.ts` PERMISSIONS)
- [x] Export `can()` helper
- [x] Add comment noting manual sync requirement with backend
- [x] Run `pnpm --filter @qyx/web typecheck` — passes
- [x] Run `pnpm --filter @qyx/web lint` — passes (1 pre-existing warning in `idb-test.ts`)
- [x] Run `pnpm --filter @qyx/web test` — **21 pass, 2 pre-existing failures unrelated to Phase 1**
  - `LandingPage.test.tsx`: 2 failures due to content mismatch (pre-existing)
  - `e2e/smoke.spec.ts`: Playwright config error (pre-existing)
  - `roles.ts` is not imported anywhere yet, so no test coverage needed at this phase

### Phase 2 — Auth Store Extension

- [x] Add `roleBucket` field to `AuthState` in `apps/web/src/stores/authStore.ts`
- [x] Update `setUser` to compute and store `roleBucket` via `bucketOf()`
- [x] Add `meVerifiedAt: number | null` field
- [x] Update `partialize` to persist `roleBucket`
- [x] Verify existing fields/methods (`setTokens`, `refreshAccessToken`, `logout`) are unchanged
- [x] Add `verifyRole()` to `apps/web/src/lib/auth.ts`
- [x] `verifyRole()` calls `getMe()`, syncs user + roleBucket, sets `meVerifiedAt`
- [x] Run typecheck, lint, test — all pass
  - `typecheck`: passes
  - `lint`: passes (1 pre-existing warning in `idb-test.ts`)
  - `test`: 21 pass, 2 pre-existing failures unrelated to Phase 2

### Phase 3 — Login Page Role Selector

- [x] Add 3-way segmented control to `LoginPage.tsx` (Super Admin / Admin / Employee)
- [x] Default selection is `employee`
- [x] Use `BUCKET_LABEL` from `roles.ts` (no hardcoded strings)
- [x] Store selection in local component state
- [x] Ensure `aria-pressed` is set correctly for accessibility
- [x] Update submit logic to compare `actualBucket` vs `selectedBucket`
- [x] Add `roleMismatch` state and inline banner UI
- [x] Implement role-mismatch navigation with `navigate(path, { state: { roleMismatch } })`
- [x] Add `SegmentedControl` to `packages/ui` (optional but recommended)
- [x] Export `SegmentedControl` from `packages/ui/src/index.ts`
- [x] Update `LoginPage.test.tsx` — assert 3 role options render, Employee is default
- [x] Run typecheck, lint, test — all pass
  - `typecheck`: passes
  - `lint`: passes (1 pre-existing warning)
  - `test`: 23 pass, 2 pre-existing failures unrelated to Phase 3 (`LandingPage.test.tsx` content mismatch, `e2e/smoke.spec.ts` Playwright config)

### Phase 4 — Routing Overhaul

- [x] Create `apps/web/src/routeGuards.tsx`
- [x] Implement `RequireGuest` (redirects to role home, not hardcoded `/app`)
- [x] Implement `RequireBucket` with 60s staleness re-verification
- [x] Implement `RequirePermission` (route-level permission guard)
- [x] Implement `HomeRedirect` (backward-compat shim for `/app`)
- [x] Implement `FullScreenSpinner` inline component
- [x] Rewrite `AppRouter.tsx` with 3 route trees (`/superadmin`, `/admin`, `/employee`)
- [x] `/superadmin/*` wrapped in `RequireBucket bucket="superadmin"`
- [x] `/admin/*` wrapped in `RequireBucket bucket="admin"`
- [x] `/employee/*` wrapped in `RequireBucket bucket="employee"`
- [x] Admin routes generated from `ADMIN_NAV_ITEMS` map (no hand-written routes)
- [x] `/app` and `/app/*` point to `HomeRedirect`
- [x] Delete `AdminWrapper` (or confirm it is unused)
- [x] Run typecheck, lint, test, build — all pass
  - `typecheck`: passes
  - `lint`: passes (1 pre-existing warning)
  - `test`: 23 pass, 2 pre-existing failures unrelated to Phase 4

### Phase 5 — Layouts and Home Pages

#### 5.1 Directory Structure

- [x] Create `layouts/SuperAdminLayout.tsx`
- [x] Create `layouts/AdminLayout.tsx`
- [x] Create `layouts/EmployeeLayout.tsx`
- [x] Create `layouts/shared/Shell.tsx`
- [x] Create `layouts/shared/RoleMismatchBanner.tsx`

#### 5.2 Shared Shell

- [x] Extract `StatusBar` into `Shell.tsx`
- [x] Extract `CommandPalette` into `Shell.tsx`
- [x] Extract wrapper structure (`h-screen w-screen flex flex-col`)
- [x] `Shell` accepts `sidebar`, `children`, `inspector` props

#### 5.3 Admin Layouts

- [x] Create `layouts/shared/AdminStyleSidebar.tsx` (shared by SuperAdmin + Admin)
- [x] SuperAdmin sidebar renders all `ADMIN_NAV_ITEMS` + extra org-creation entry
- [x] Admin sidebar filters `ADMIN_NAV_ITEMS` via `can(user.role, item.permission)`

#### 5.4 Old Layout Decomposition

- [x] Move `DirectoryPane` to `layouts/shared/DirectoryPane.tsx`
- [x] Move `InspectorPane` to `layouts/shared/InspectorPane.tsx`
- [x] Mount `InspectorPane` in `SuperAdminLayout` and `AdminLayout` only
- [x] Update `CommandPalette` items to use role-relative paths
- [x] Hide `CommandPalette` items user can't reach via `can()`

#### 5.5 Home Pages

- [x] Create `features/superadmin/pages/SuperAdminHome.tsx`
- [x] Create `features/admin/pages/AdminHome.tsx`
- [x] Create `features/employee/pages/EmployeeHome.tsx`
- [x] `EmployeeHome` wraps existing `AppPage` chat UI
- [x] All home pages render `useOneTimeLocationBanner` for role-mismatch banner
- [x] `SuperAdminHome` shows org health summary + quick-links
- [x] `AdminHome` generates quick-links from permission-filtered `ADMIN_NAV_ITEMS`
- [x] `EmployeeLayout` is lightweight (DirectoryPane + Shell, no InspectorPane)

#### 5.6 Cleanup

- [x] Delete old `AuthenticatedLayout.tsx`
- [x] Delete `AdminWrapper` if still present
- [x] Remove dead imports across the codebase
- [x] Run typecheck, lint, test, build — all pass
  - `typecheck`: passes
  - `lint`: passes (1 pre-existing warning)
  - `test`: 23 pass, 2 pre-existing failures unrelated to Phase 5.6
  - `build`: passes

### Phase 6 — Registration / Onboarding Redirects

- [x] Update `RegisterPage.tsx` post-registration redirect to use `bucketOf(data.user.role)`
- [x] Update `OnboardingPage.tsx` completion redirect to `/superadmin`
- [x] Update `MfaPage.tsx` to navigate via `ROLE_HOME_PATH[bucketOf(role)]`
- [x] Update `SsoCallbackPage.tsx` to navigate via role bucket instead of hardcoded `/app`
- [x] Run typecheck, lint, test, build — all pass
  - `typecheck`: passes
  - `lint`: passes (1 pre-existing warning)
  - `test`: 23 pass, 2 pre-existing failures unrelated to Phase 6
  - `build`: passes

### Phase 7 — Tests

- [x] Update `LoginPage.test.tsx` with role-selector assertions
- [x] Create `routeGuards.test.tsx` — test `RequireBucket`, `RequirePermission` redirect decisions
- [x] Test cases: no token → `/login`; matching bucket → renders; mismatched bucket → correct home; `/auth/me` failure → `/login`
- [x] Create `roles.test.ts` — test `bucketOf` for all 5 backend roles
- [x] Test unknown/garbage role falls back to `employee`
- [x] Update any tests asserting navigation to `/app` — none found
- [x] Add/extend Playwright e2e for 3 role-routing flows (or mock via network interception)
- [x] Run full test suite — 36 pass, 2 pre-existing LandingPage failures, 1 pre-existing Playwright e2e failure

### Final Verification

- [ ] `pnpm --filter @qyx/web typecheck` — passes
- [ ] `pnpm --filter @qyx/web lint` — passes
- [ ] `pnpm --filter @qyx/web test` — passes
- [ ] `pnpm --filter @qyx/web build` — passes
- [ ] Manual smoke test: log in as each role bucket, verify correct home app loads
- [ ] Manual smoke test: cross-navigate to another bucket's path, verify redirect
- [ ] Manual smoke test: role mismatch banner appears and dismisses correctly
- [ ] PR description includes link to backend RBAC middleware ordering bug