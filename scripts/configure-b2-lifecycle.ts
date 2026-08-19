#!/usr/bin/env node

import { execSync } from 'child_process';

const ENVIRONMENTS = ['staging', 'production'];
const BUCKETS = {
  staging: 'qyx-attachments-staging',
  production: 'qyx-attachments-prod',
};

async function configureB2Lifecycle(_env: string): Promise<void> {
  console.log('B2 lifecycle rules must be configured manually via the Backblaze dashboard.');
  console.log('Navigate to: Bucket Settings → Lifecycle Settings');
  console.log('B2 lifecycle rules differ from R2 and cannot be ported 1:1.');
  console.log('Typical rules to configure:');
  console.log('  - daysFromUploadingToHiding for backup/ prefix');
  console.log('  - daysFromHidingToDeleting for current objects');
  console.log('');
  console.log('Alternatively, use the B2 CLI or b2_update_bucket API.');
}

async function main(): Promise<void> {
  const env = process.argv[2];

  if (!env || !ENVIRONMENTS.includes(env)) {
    console.log('Usage: npm run backup:configure -- <staging|production>');
    process.exit(1);
  }

  await configureB2Lifecycle(env);
}

main().catch((error) => {
  console.error('B2 lifecycle configuration failed:', error);
  process.exit(1);
});
