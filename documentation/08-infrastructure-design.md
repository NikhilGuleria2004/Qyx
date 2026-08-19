# Infrastructure Design

## 1. Purpose

Describes where and how every component runs: environments, Cloudflare resource topology, networking, scaling, and cost/ops considerations.

## 2. Cloud Provider & Rationale

**Cloudflare** is used end-to-end (Workers, Pages, D1, R2, Durable Objects, Queues, KV, DNS/CDN/SSL) to minimize cross-provider latency and operational surface area, and because the platform's edge-first, stateless-compute model maps naturally onto Workers.

## 3. Environments

| Environment | Purpose | Notes |
|---|---|---|
| `dev` | Local + preview deploys per PR | Wrangler local dev (Miniflare-backed), isolated D1/KV/R2 namespaces |
| `staging` | Pre-production validation | Mirrors prod topology, seeded synthetic org/test data only |
| `production` | Live customer traffic | Strict change control, all deploys via CI/CD gate |

Each environment has fully separate: D1 database, R2 buckets, KV namespaces, Durable Object namespaces, and secrets (via Wrangler secrets / Cloudflare dashboard), to guarantee no cross-environment data bleed.

## 4. Resource Topology

```
Cloudflare Account
├── Pages Project: web-app          → serves built React SPA (dev/staging/prod branches)
├── Workers Service: api-gateway    → Hono app, routes to logical services
│     ├── Durable Object binding: CONVERSATION_DO
│     ├── Durable Object binding: CHANNEL_DO
│     ├── D1 binding: PRIMARY_DB
│     ├── B2 binding: B2_KEY_ID / B2_APPLICATION_KEY / B2_ENDPOINT / B2_REGION / B2_BUCKET_NAME
│     ├── KV binding: SESSION_KV, RATE_LIMIT_KV, CHALLENGE_KV
│     └── Queue bindings: OFFLINE_DELIVERY_QUEUE, EMAIL_QUEUE, AUDIT_QUEUE
├── Workers Service: notification-worker  → Queue consumer, Resend integration
├── Workers Service: audit-worker          → Queue consumer, aggregates security metrics
├── D1 Database: primary (per environment)
├── R2 Buckets: attachments, avatars (per environment)
├── KV Namespaces: sessions, rate-limits, challenges, domain-verification
└── Queues: offline-delivery, email, audit
```

Logical services (Identity, Organization, Messaging, Group, Channel, File — per HLD §4) are implemented as route modules within `api-gateway` initially; the boundary is kept clean (separate directories, no cross-imports of internal state) so any can be split into an independently deployed Worker later without a rewrite.

## 5. Networking & Edge

- **DNS/CDN/SSL:** Cloudflare-managed for the product domain; automatic TLS termination at the edge (TLS 1.3).
- **Pages:** static assets served from Cloudflare's global CDN.
- **Workers:** execute in the data center closest to the requester by default; D1 read replicas and Durable Object location hints used to keep latency low for realtime paths.
- **WebSocket connections:** terminated at the edge Worker, upgraded to the appropriate `ConversationDO`/`ChannelDO` instance (Durable Objects provide a single global location per object ID, so all participants in one conversation converge on one DO instance — an explicit trade-off of consistency over per-user locality for that specific conversation's realtime path).

## 6. Scaling Model

| Layer | Scaling approach |
|---|---|
| Workers (API) | Automatic, per-request, effectively unbounded horizontal scale at the edge |
| Durable Objects | Natural sharding by `conversation_id`/`group_id`/`channel_id`; large broadcast channels may require a fan-out sub-sharding pattern (multiple DOs per channel, coordinated) if subscriber counts exceed a single DO's practical connection ceiling — tracked as a scaling checkpoint, not a v1 blocker |
| D1 | Read-scaled via Cloudflare's read-replication; write throughput monitored per org shard if a single org's message volume becomes a hot spot (mitigation: partitioning strategy revisited at scale) |
| R2 | Effectively unbounded object storage; no scaling action needed |
| Queues | Automatic; consumer concurrency tunable per Queue |
| KV | Eventually consistent, globally distributed; used only for cache/session data that tolerates this |

## 7. Secrets & Configuration

- Managed via `wrangler secret put` per environment (never committed to the repo).
- Includes: SSO client secrets/certs, Resend API key, Sentry DSN, JWT signing keys, R2 access credentials (if needed beyond binding-based access), any enterprise-recovery KMS integration credentials.
- Environment-specific `wrangler.toml` (or `wrangler.jsonc`) files per service define bindings; no shared config between environments.

## 8. Disaster Recovery & Backup

- D1: scheduled export/backup job (Queue-triggered) to R2 (encrypted-at-rest by Cloudflare) on a defined cadence (e.g., daily), with point-in-time recovery evaluated against Cloudflare D1's native capabilities as they mature.
- R2: versioning/lifecycle rules configured per bucket; cross-region durability provided by R2 itself.
- Runbook: environment rebuild from IaC (Wrangler config + migrations) + latest backup restore, tested periodically (see Testing Strategy §Disaster Recovery Drills).

## 9. Cost Considerations

- Workers/D1/R2/KV/Queues billed on usage (requests, storage, duration) — architecture favors this pay-per-use model given variable enterprise traffic patterns.
- Durable Object duration billing is monitored closely since realtime connections are long-lived; idle-timeout and connection-cleanup logic in `ConversationDO`/`ChannelDO` prevent unbounded resource retention.

## 10. Infrastructure-as-Code

- All Cloudflare resources (Workers, D1, R2 buckets, KV namespaces, Queues, DO namespaces) defined declaratively in `wrangler.toml`/`wrangler.jsonc` per service, checked into Git.
- D1 schema/migrations version-controlled (`migrations/*.sql`) and applied via CI/CD, never manually in production.
- No manual dashboard changes to production resources outside of emergency break-glass procedures (logged and reconciled back into IaC afterward).
