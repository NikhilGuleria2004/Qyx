#!/usr/bin/env node

import { execSync } from 'child_process';

const ENVIRONMENTS = ['staging', 'production'];
const BUCKETS = {
  staging: 'qyx-attachments-staging',
  production: 'qyx-attachments-prod',
};

interface LifecycleRule {
  id: string;
  prefix: string;
  status: string;
  rule: {
    action: { type: string };
    condition: { age_days: number };
  };
}

async function configureR2Lifecycle(env: string): Promise<void> {
  const bucket = BUCKETS[env as keyof typeof BUCKETS];
  console.log(`Configuring R2 lifecycle for ${env} (${bucket})...`);

  const rules: LifecycleRule[] = [
    {
      id: 'backup-versioning',
      prefix: 'backup/',
      status: 'enabled',
      rule: {
        action: { type: 'AbortIncompleteMultipartUpload' },
        condition: { age_days: 7 },
      },
    },
    {
      id: 'current-version',
      prefix: '',
      status: 'enabled',
      rule: {
        action: { type: 'AbortIncompleteMultipartUpload' },
        condition: { age_days: 1 },
      },
    },
  ];

  for (const rule of rules) {
    try {
      execSync(
        `wrangler r2 bucket lifecycle create ${bucket} --rule '${JSON.stringify(rule)}' --env ${env}`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      console.error(`Failed to create lifecycle rule for ${bucket}:`, error);
    }
  }

  console.log(`R2 lifecycle configured for ${env}`);
}

async function main(): Promise<void> {
  const env = process.argv[2];

  if (!env || !ENVIRONMENTS.includes(env)) {
    console.log('Usage: npm run backup:configure -- <staging|production>');
    process.exit(1);
  }

  await configureR2Lifecycle(env);
}

main().catch((error) => {
  console.error('R2 lifecycle configuration failed:', error);
  process.exit(1);
});
