import { Queue } from '@cloudflare/workers-types';

type Env = {
  PRIMARY_DB: D1Database;
  ATTACHMENTS_BUCKET: R2Bucket;
  BACKUP_QUEUE: Queue;
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 2 * * *') {
      await createD1Backup(env);
    }
    if (event.cron === '0 3 * * *') {
      await createR2Backup(env);
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

async function createR2Backup(env: Env): Promise<void> {
  try {
    const bucket = env.ATTACHMENTS_BUCKET;
    const objects = await bucket.list();
    
    for (const obj of objects.objects) {
      const backupKey = `backup/${obj.key}`;
      const objectData = await bucket.get(obj.key);
      
      if (objectData) {
        await bucket.put(backupKey, objectData.body, {
          customMetadata: {
            original_key: obj.key,
            backup_date: new Date().toISOString(),
          },
        });
      }
    }
    
    console.log(`R2 backup completed: ${objects.objects.length} objects backed up`);
  } catch (error) {
    console.error('R2 backup error:', error);
  }
}

function getAccountId(): string {
  return process.env.CLOUDFLARE_ACCOUNT_ID || '';
}

function getDatabaseId(_db: D1Database): string {
  return process.env.CLOUDFLARE_DATABASE_ID || '';
}
