# Deployment / CI-CD Specification

## 1. Purpose

Defines how code moves from a developer's machine to production: branching strategy, pipeline stages, deployment tooling (Wrangler), and rollback procedures.

## 2. Toolchain

- **Package manager:** pnpm (workspaces, monorepo)
- **CI/CD:** GitHub Actions
- **Deployment CLI:** Wrangler (Cloudflare Workers/Pages/D1/R2/Queues/KV)
- **Version control:** Git + GitHub
- **Monitoring/error tracking:** Sentry (post-deploy verification hook)

## 3. Repository & Branching Strategy

```
main            → production-tracking branch, protected, deploys to production on tag/release
develop         → integration branch, deploys to staging automatically
feature/*       → short-lived, PR into develop
hotfix/*        → branched from main, PR back into main + develop
```

- All changes via Pull Request; direct pushes to `main`/`develop` disabled.
- Required PR checks (branch protection): lint, type-check, unit tests, integration tests, org-isolation regression suite, at least one code-owner review (mandatory second reviewer for changes touching `middleware/`, `lib/crypto/`, `services/identity/`, `services/organization/`).

## 4. Pipeline Stages (GitHub Actions)

```
on: pull_request → develop
  1. Checkout + pnpm install (cached)
  2. Lint (ESLint) + Format check (Prettier)
  3. Type-check (tsc --noEmit)
  4. Unit tests (Vitest) + coverage gate
  5. Integration tests (Vitest + Miniflare against ephemeral D1)
  6. Org-isolation regression suite (blocking)
  7. Build frontend (Vite) + Workers (wrangler build/dry-run)
  8. Deploy ephemeral preview (Cloudflare Pages preview + Workers preview env, PR-scoped)
  9. Playwright smoke suite against preview environment
  10. Post PR comment with preview URL + results summary

on: push → develop
  1-7 as above
  8. Deploy to `staging` (Pages + Workers via Wrangler, staging bindings)
  9. Run D1 migrations against staging (wrangler d1 migrations apply --env staging)
  10. Full Playwright regression suite against staging
  11. Notify team channel of staging deploy status

on: release tag (vX.Y.Z) from main
  1-7 as above (against main)
  8. Manual approval gate (required reviewers: release owner + security sign-off for crypto/auth-touching releases)
  9. Deploy to `production`:
      a. Run D1 migrations (wrangler d1 migrations apply --env production)
      b. Deploy Workers services (api-gateway, notification-worker, audit-worker)
      c. Deploy Pages (frontend)
  10. Post-deploy smoke test against production (read-only health checks + synthetic non-destructive transaction in a dedicated canary org)
  11. Sentry release marker created; error-rate watch window (e.g., 30 min) before pipeline marks release "stable"
  12. Rollback triggers automatically if error-rate threshold exceeded during watch window (see §6)
```

## 5. Environment Promotion Model

```
feature/* → (PR) → develop → staging (auto) → main (release PR) → production (tag + manual approval)
```

No environment is ever deployed to directly from a developer machine; `wrangler deploy` is only invoked by CI runners using environment-scoped, least-privilege Cloudflare API tokens stored as GitHub encrypted secrets.

## 6. Rollback Strategy

- **Workers/Pages:** Wrangler retains prior deployment versions; rollback = redeploy previous version via `wrangler rollback` (or CI re-run of the last known-good release tag), typically < 2 minutes to effect.
- **D1 migrations:** forward-only migration philosophy preferred; destructive migrations require a paired "expand/contract" pattern (add new columns/tables, backfill, migrate reads, then drop old — never a single-step destructive change) so rollback of application code doesn't require a matching destructive DB rollback.
- **Automatic rollback trigger:** if post-deploy Sentry error rate exceeds a defined threshold (e.g., 5x baseline) within the watch window, CI automatically redeploys the previous Workers/Pages version and pages the on-call engineer.

## 7. Secrets Management in CI/CD

- Cloudflare API tokens, SSO client secrets, Resend API key, JWT signing keys stored as GitHub Actions encrypted secrets, scoped per environment (`staging-*`, `production-*`), never printed in logs.
- Least-privilege tokens: the `production` deploy token can only touch production resources; it cannot be used to modify `staging` or `dev`.

## 8. Database Migration Policy

- Every migration PR includes: forward SQL, a written rollback/mitigation note (even if "forward-only, mitigated by expand/contract"), and a checklist confirming new tables carry `organization_id` + index (per Database Design §6/7).
- Migrations run automatically in `staging` on merge to `develop`; run in `production` only as an explicit, reviewed step within the release pipeline (§4, release tag stage), never silently bundled with a routine Workers deploy.

## 9. Feature Flags

- Higher-risk or phased features (e.g., SSO providers, enterprise recovery key, Manager/Security Admin role split) are gated behind org-level feature flags stored in `org_security_policy`/a dedicated flags table, allowing progressive rollout without separate deploys.

## 10. Release Checklist (summary)

- [ ] All CI gates green (lint, type-check, unit, integration, org-isolation, E2E)
- [ ] Migrations reviewed against Database Design conventions
- [ ] Security sign-off obtained if release touches crypto/auth/org-scoping code
- [ ] Changelog/release notes prepared
- [ ] Rollback plan confirmed (previous version identified, migration rollback/mitigation noted)
- [ ] Post-deploy monitoring window staffed (on-call assigned)
