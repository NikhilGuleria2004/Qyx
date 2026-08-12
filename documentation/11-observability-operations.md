# Observability & Operations

## 1. Purpose

Defines how the running system is monitored, debugged, and operated day to day — logging, metrics, alerting, incident response, and on-call practices — while preserving the platform's core constraint: **no plaintext content ever appears in logs, metrics, or traces.**

## 2. Observability Stack

| Concern | Tool |
|---|---|
| Error tracking / exceptions | Sentry (frontend + Workers) |
| Structured application logs | Workers `console.log` → Cloudflare Logpush → downstream sink (e.g., object storage/log platform) |
| Metrics / dashboards | Cloudflare Analytics (Workers, D1, R2, Queues native metrics) + custom application metrics emitted to a metrics store |
| Realtime health | Durable Object connection counts, WebSocket error rates |
| Uptime/synthetic checks | Scheduled Worker (cron trigger) performing non-destructive health probes against a canary org |

## 3. Logging Standards

- **Structured JSON logs** with a consistent envelope:
```json
{
  "timestamp": "2026-08-12T09:00:00Z",
  "level": "info",
  "service": "messaging",
  "request_id": "req_01hz...",
  "organization_id": "org_44b1",
  "user_id": "usr_72a91f",
  "event": "message_sent",
  "conversation_id": "conv_11c9"
}
```
- **Hard rule:** no field in any log line may ever contain message ciphertext, plaintext, file contents, or raw key material. Log statements touching `messages`/`files` tables are restricted to IDs and non-content metadata only — enforced via code review checklist and a lint rule flagging `ciphertext`/`public_key`/`signing_key` field names in `console.log`/logger calls.
- `request_id` propagated end-to-end (API Gateway → downstream Worker → Queue consumer) for full-path tracing of a single request/event.

## 4. Metrics

**Golden signals per service (api-gateway, messaging, group, channel, file, identity, organization):**
- Request rate, error rate, latency (p50/p95/p99).
- Durable Object: active connections per DO, message fan-out latency, DO CPU time.
- Queue: depth, consumer lag, retry count, dead-letter count.
- D1: query latency, error rate.
- R2: upload/download success rate, latency.

**Business/security metrics (feed the Admin Security Center, aggregated — never per-message content):**
- MFA adoption %, verified device %, active sessions, suspended accounts, unrecognized/new devices, failed login rate, cross-org access-denial count (a spike here is itself a security signal, see §6).

## 5. Alerting

| Alert | Condition | Severity |
|---|---|---|
| Elevated error rate (any Worker) | Error rate > 5x rolling baseline for 5 min | High |
| Realtime delivery latency regression | p95 message delivery > 500ms for 10 min | Medium |
| Cross-org access-denial spike | `ORG_SCOPE_VIOLATION` rate exceeds baseline threshold | High — possible attack or bug |
| Auth failure spike | Failed login rate exceeds threshold for a single org/IP | High — possible credential stuffing |
| Queue backlog growth | Offline-delivery or email queue depth exceeds threshold | Medium |
| D1 error rate | D1 query error rate exceeds threshold | High |
| Certificate/SSO integration failure | SSO callback error rate spike for a given org | Medium |
| Post-deploy Sentry error spike | Exceeds automatic-rollback threshold (see Deployment doc §6) | Critical — triggers auto-rollback |

Alerts route to the on-call rotation (e.g., PagerDuty/Opsgenie-style integration) with severity-based paging thresholds; Critical pages immediately, Medium/High during business hours unless sustained.

## 6. Security Monitoring (SOC-lite)

- Cross-org access-denial events and failed-login spikes are treated as security signals, not just reliability signals, and are visible to the Security/Admin audience distinctly from general engineering alerting.
- Audit event stream (from `audit_events` table, per Security Design §10) is the canonical record for security investigations; correlated with `request_id`-tagged logs for a full incident timeline, still without ever surfacing message content.

## 7. Incident Response

**Severity levels:**
- **SEV1:** platform-wide outage, confirmed cross-org data exposure, or confirmed encryption/key-management failure.
- **SEV2:** partial outage, degraded realtime delivery, single-org isolated issue.
- **SEV3:** minor bug, non-customer-facing degradation.

**SEV1 process:**
1. Page on-call + engineering lead + security owner immediately.
2. Establish incident channel, assign incident commander.
3. If cross-org exposure suspected: immediately audit `audit_events`/logs for the affected `organization_id`s, contain (e.g., feature-flag disable or targeted rollback), notify affected organizations per the incident communication plan.
4. Post-incident: written postmortem (blameless), root cause, remediation items tracked to closure, and — if the incident involved a confirmed crypto/isolation failure — an update to the pre-production security gate checklist to prevent recurrence.

## 8. Runbooks (maintained alongside this doc)

- Rollback a bad deploy (Workers/Pages).
- Rotate a compromised device/session (force revoke + notify user).
- Respond to a suspected cross-org access-denial spike (investigate, contain, communicate).
- Restore D1/R2 from backup (linked to Infrastructure Design §8 and Testing Strategy §10 DR drill procedure).
- Rotate platform-level secrets (Cloudflare tokens, Resend key, JWT signing keys, SSO client secrets).

## 9. On-Call & Ownership

- Rotating on-call engineer covers Workers/API/Realtime health.
- Security-sensitive alerts (cross-org denial spikes, auth anomalies) additionally notify a security owner/DRI, distinct from general on-call, reflecting the platform's security-first posture.
- Each logical service (Identity, Organization, Messaging, Group, Channel, File) has a named owning team/individual of record for escalation.

## 10. Dashboards

- **Engineering dashboard:** golden signals per service, DO/Queue/D1/R2 health, deploy markers (Sentry releases overlaid on error-rate graphs).
- **Security dashboard (Admin-facing, product feature):** the Admin Security Center described in the PRD/Security Design — MFA adoption, device verification, active sessions, suspended accounts, unrecognized devices — built from the same aggregated metrics pipeline but exposed as a first-class in-product surface, not just an internal ops tool.
