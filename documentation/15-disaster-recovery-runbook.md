# Disaster Recovery Runbook

## 1. Overview

This runbook describes the procedure for restoring the Qyx platform from backups in the event of data loss, corruption, or disaster recovery scenario.

## 2. Backup Strategy

### D1 Backups
- **Frequency:** Daily at 02:00 UTC
- **Retention:** 30 days
- **Storage:** R2 backup bucket (`qyx-backups-staging` / `qyx-backups-prod`)
- **Format:** SQL dump via Cloudflare D1 backup API

### R2 Backups
- **Frequency:** Daily at 03:00 UTC
- **Retention:** 30 days
- **Storage:** Same bucket with `backup/` prefix
- **Versioning:** Enabled with lifecycle rules

## 3. Restore Procedure

### Prerequisites
- Cloudflare API token with D1 and R2 permissions
- `wrangler` CLI installed and authenticated
- Access to the target environment's GitHub secrets

### Steps

1. **Identify the backup to restore:**
   ```bash
   npm run restore -- list
   ```

2. **Verify backup integrity:**
   ```bash
   npm run restore -- verify <backup-date>
   ```

3. **Restore D1 database:**
   ```bash
   # Download the backup
   wrangler r2 object get qyx-backups-staging/d1-backup-<date>.sql --file ./restore/d1-backup.sql
   
   # Restore to target database
   wrangler d1 execute qyx_primary_staging --file ./restore/d1-backup.sql --env staging
   ```

4. **Restore R2 objects:**
   ```bash
   # Download backup manifest
   wrangler r2 object get qyx-backups-staging/r2-manifest-<date>.json --file ./restore/manifest.json
   
   # Restore objects (scripted)
   node scripts/restore-r2.js --manifest ./restore/manifest.json --bucket qyx-attachments-staging
   ```

5. **Verify data integrity:**
   ```bash
   wrangler d1 execute qyx_primary_staging --command "SELECT COUNT(*) as users FROM users" --env staging
   wrangler d1 execute qyx_primary_staging --command "SELECT COUNT(*) as conversations FROM conversations" --env staging
   ```

6. **Run application smoke tests:**
   ```bash
   pnpm test
   ```

## 4. RTO/RPO Targets

| Metric | Target | Current |
|---|---|---|
| RPO (Recovery Point Objective) | 24 hours | 24 hours (daily backups) |
| RTO (Recovery Time Objective) | 4 hours | TBD (first drill) |

## 5. Backup Schedule

| Backup Type | Schedule | Retention |
|---|---|---|
| D1 (staging) | Daily 02:00 UTC | 30 days |
| D1 (production) | Daily 02:00 UTC | 30 days |
| R2 (staging) | Daily 03:00 UTC | 30 days |
| R2 (production) | Daily 03:00 UTC | 30 days |

## 6. DR Drill Procedure

1. Schedule drill quarterly (Testing Strategy §10)
2. Use latest staging backup
3. Restore to isolated test environment
4. Verify data integrity and application functionality
5. Time the recovery process
6. Document results and update RTO/RPO estimates
7. Update this runbook if procedures change

## 7. Emergency Contacts

- On-call engineer: [PagerDuty/OpsGenie]
- Cloudflare support: https://dash.cloudflare.com/support
- Internal escalation: #engineering Slack channel
