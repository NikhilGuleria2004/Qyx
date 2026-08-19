#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BACKUP_DIR = join(process.cwd(), 'backups', 'staging');
const RESTORE_DIR = join(process.cwd(), 'restore');

interface BackupManifest {
  timestamp: string;
  d1_backup: string;
  storage_manifest: string;
  objects: Array<{ key: string; size: number }>;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      await listBackups();
      break;
    case 'restore':
      const backupDate = args[1];
      if (!backupDate) {
        console.error('Usage: npm run restore -- <backup-date>');
        process.exit(1);
      }
      await restoreBackup(backupDate);
      break;
    case 'verify':
      await verifyBackup(args[1]);
      break;
    default:
      console.log('Usage: npm run restore -- <list|restore|verify> [backup-date]');
      process.exit(1);
  }
}

async function listBackups(): Promise<void> {
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
  console.log('Available backups:');
  for (const file of files.sort()) {
    console.log(`  - ${file}`);
  }
}

async function restoreBackup(backupDate: string): Promise<void> {
  const manifestPath = join(BACKUP_DIR, `storage-manifest-${backupDate}.json`);

  if (!existsSync(manifestPath)) {
    console.error(`Backup manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  console.log(`Restoring backup from ${manifest.timestamp}`);
  console.log(`  D1 backup: ${manifest.d1_backup}`);
  console.log(`  Storage objects: ${manifest.objects.length}`);

  if (!existsSync(RESTORE_DIR)) {
    mkdirSync(RESTORE_DIR, { recursive: true });
  }

  const restoreManifestPath = join(RESTORE_DIR, `restore-${backupDate}.json`);
  const restoreManifest = {
    timestamp: new Date().toISOString(),
    backup_timestamp: manifest.timestamp,
    d1_backup: manifest.d1_backup,
    storage_objects_restored: 0,
    storage_objects_failed: 0,
    status: 'pending_storage_restore',
    note: 'Storage restore requires copying objects from backup bucket to live bucket via B2 CLI or S3-compatible tool. D1 restore requires importing the .sql file via wrangler d1 import.',
  };
  writeFileSync(restoreManifestPath, JSON.stringify(restoreManifest, null, 2));

  console.log(`\n⚠️  Storage and D1 restore require manual steps via B2 CLI or S3-compatible tool:`);
  console.log(`\n1. Storage restore (copy from backup bucket to live bucket):`);
  console.log(`   b2 file copy-by-name qyx-backups-staging backup/<object-key> qyx-attachments-staging <object-key>`);
  for (const obj of manifest.objects) {
    console.log(`   b2 file copy-by-name qyx-backups-staging backup/${obj.key} qyx-attachments-staging ${obj.key}`);
  }
  console.log(`\n2. D1 restore (import SQL backup):`);
  console.log(`   wrangler d1 import qyx_primary_staging ${manifest.d1_backup} --remote`);
  console.log(`\n3. Verify restore:`);
  console.log(`   npm run restore -- verify ${backupDate}`);
  console.log(`\nRestore manifest written to ${restoreManifestPath}`);
}

async function verifyBackup(backupDate: string): Promise<void> {
  const manifestPath = join(BACKUP_DIR, `storage-manifest-${backupDate}.json`);

  if (!existsSync(manifestPath)) {
    console.error(`Backup manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  console.log(`Verifying backup from ${manifest.timestamp}`);
  console.log(`  Objects: ${manifest.objects.length}`);
  console.log(`  Total size: ${manifest.objects.reduce((sum, obj) => sum + obj.size, 0)} bytes`);
  console.log(`  D1 backup file: ${manifest.d1_backup}`);
}

function readdirSync(dir: string): string[] {
  try {
    return require('fs').readdirSync(dir);
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error('Restore failed:', error);
  process.exit(1);
});
