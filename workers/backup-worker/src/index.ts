import { Queue } from '@cloudflare/workers-types';
import { createB2Storage } from '@qyx/storage';

type Env = {
  PRIMARY_DB: D1Database;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET_NAME: string;
  BACKUP_QUEUE: Queue;
  CLOUDFLARE_API_TOKEN: string;
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 2 * * *') {
      await createD1Backup(env);
    }
    if (event.cron === '0 3 * * *') {
      await createB2Backup(env);
    }
  },
};

async function createD1Backup(env: Env): Promise<void> {
  try {
    const accountId = getAccountId();
    const databaseId = getDatabaseId(env.PRIMARY_DB);

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/backup`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `d1-backup-${Date.now()}`,
          expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`D1 backup failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('D1 backup created:', JSON.stringify(result));
  } catch (error) {
    console.error('D1 backup error:', error);
  }
}

async function createB2Backup(env: Env): Promise<void> {
  try {
    const storage = createB2Storage({
      keyId: env.B2_KEY_ID,
      applicationKey: env.B2_APPLICATION_KEY,
      endpoint: env.B2_ENDPOINT,
      region: env.B2_REGION,
      bucket: env.B2_BUCKET_NAME,
    });
    const objects = await storage.list();

    for (const obj of objects.objects) {
      const backupKey = `backup/${obj.key}`;
      const objectData = await storage.get(obj.key);

      if (objectData) {
        await storage.put(backupKey, objectData.body, {
          customMetadata: {
            original_key: obj.key,
            backup_date: new Date().toISOString(),
          },
        });
      }
    }

    console.log(`B2 backup completed: ${objects.objects.length} objects backed up`);
  } catch (error) {
    console.error('B2 backup error:', error);
  }
}

function getAccountId(): string {
  return process.env.CLOUDFLARE_ACCOUNT_ID || '';
}

function getDatabaseId(_db: D1Database): string {
  return process.env.CLOUDFLARE_DATABASE_ID || '';
}
