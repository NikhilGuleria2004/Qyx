# Migration: Cloudflare R2 → Backblaze B2

## Context

This repo (Qyx) currently uses Cloudflare R2 as its object storage for encrypted file
attachments, accessed via the native `R2Bucket` Workers binding (`ATTACHMENTS_BUCKET`).
We are switching to **Backblaze B2** because R2 is not viable on the free tier we're using.

Cloudflare Workers cannot use R2-style bindings for a third-party provider — there is no
"B2 binding." Instead, B2 must be called over HTTP from within Worker code. Use B2's
**S3-compatible API** (not the native B2 API) so we can keep a presigned-URL upload/download
flow, which matches the app's existing architecture. Sign requests with `aws4fetch`, a small
fetch-based SigV4 library that works natively in the Workers runtime (no Node.js `crypto`/`fs`
dependency, unlike the official AWS SDK).

**Do not change:** the D1 database schema, the E2EE/crypto logic in `packages/crypto`, the
`encrypted_storage_reference` column semantics (it stays as "the object key in the bucket"),
or any business logic unrelated to storage I/O. This is a storage-transport swap only.

---

## 1. Get Backblaze credentials first

Before touching code, create in the Backblaze B2 dashboard:

1. A bucket per environment (e.g. `qyx-attachments-dev`, `qyx-attachments-staging`,
   `qyx-attachments-prod`), private, versioning off unless needed.
2. An **Application Key** scoped to only that bucket, with read+write+delete+list capabilities
   (not the master key). Note down:
   - `keyID` → this becomes `B2_KEY_ID`
   - `applicationKey` → this becomes `B2_APPLICATION_KEY` (secret)
   - the bucket's **S3-compatible endpoint**, e.g. `s3.us-west-004.backblazeb2.com`, shown on
     the bucket details page → this becomes `B2_ENDPOINT`
   - the region implied by that endpoint, e.g. `us-west-004` → this becomes `B2_REGION`
   - the bucket name → this becomes `B2_BUCKET_NAME`

These are supplied per-environment as Worker vars/secrets (see §5), not committed to git.

---

## 2. Add the `aws4fetch` dependency

Add `aws4fetch` to any package that talks to storage directly:

```bash
pnpm --filter @qyx/api-gateway add aws4fetch
pnpm --filter @qyx/backup-worker add aws4fetch
```

(Adjust filter names to match whatever `name` fields are in `apps/api-gateway/package.json`
and `workers/backup-worker/package.json`.)

---

## 3. Create a shared storage abstraction

Create a new file at `packages/storage/src/index.ts` (new package, sibling to
`packages/crypto`, `packages/schemas`, etc.) so both `api-gateway` and `backup-worker` share
one implementation instead of duplicating B2 logic.

Set up `packages/storage/package.json`, `tsconfig.json` following the same pattern as
`packages/crypto` (check that package's config files and mirror them, renaming to
`@qyx/storage`). Add `"@qyx/storage": "workspace:*"` as a dependency in
`apps/api-gateway/package.json` and `workers/backup-worker/package.json`.

Implement `packages/storage/src/index.ts`:

```ts
import { AwsClient } from 'aws4fetch';

export interface B2Config {
  keyId: string;
  applicationKey: string;
  endpoint: string;   // e.g. "s3.us-west-004.backblazeb2.com"
  region: string;     // e.g. "us-west-004"
  bucket: string;
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  customMetadata: Record<string, string>;
  size: number;
}

export interface ListedObject {
  key: string;
  size: number;
}

/**
 * Thin S3-compatible client over Backblaze B2, replacing the Cloudflare R2Bucket
 * binding. Mirrors the subset of R2Bucket's surface this codebase actually used
 * (get/put/delete/list), plus presigned URL generation which the R2 code had only
 * stubbed out before.
 */
export class B2Storage {
  private client: AwsClient;
  private baseUrl: string;

  constructor(private config: B2Config) {
    this.client = new AwsClient({
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
      region: config.region,
      service: 's3',
    });
    this.baseUrl = `https://${config.bucket}.${config.endpoint}`;
  }

  private objectUrl(key: string): string {
    return `${this.baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(
    key: string,
    body: ReadableStream | ArrayBuffer | Uint8Array,
    opts?: { customMetadata?: Record<string, string>; contentType?: string }
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (opts?.contentType) headers['content-type'] = opts.contentType;
    if (opts?.customMetadata) {
      for (const [k, v] of Object.entries(opts.customMetadata)) {
        headers[`x-amz-meta-${k}`] = v;
      }
    }
    const res = await this.client.fetch(this.objectUrl(key), {
      method: 'PUT',
      headers,
      body: body as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`B2 put failed for ${key}: ${res.status} ${await res.text()}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`B2 get failed for ${key}: ${res.status} ${await res.text()}`);
    }
    const customMetadata: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (name.startsWith('x-amz-meta-')) {
        customMetadata[name.replace('x-amz-meta-', '')] = value;
      }
    });
    return {
      body: res.body as ReadableStream<Uint8Array>,
      customMetadata,
      size: Number(res.headers.get('content-length') ?? 0),
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`B2 delete failed for ${key}: ${res.status} ${await res.text()}`);
    }
  }

  async list(prefix = ''): Promise<{ objects: ListedObject[] }> {
    const url = new URL(this.baseUrl + '/');
    url.searchParams.set('list-type', '2');
    if (prefix) url.searchParams.set('prefix', prefix);

    const res = await this.client.fetch(url.toString(), { method: 'GET' });
    if (!res.ok) {
      throw new Error(`B2 list failed: ${res.status} ${await res.text()}`);
    }
    const xml = await res.text();
    const objects: ListedObject[] = [];
    const keyRe = /<Key>(.*?)<\/Key>\s*<LastModified>.*?<\/LastModified>\s*<ETag>.*?<\/ETag>\s*<Size>(\d+)<\/Size>/g;
    let match: RegExpExecArray | null;
    while ((match = keyRe.exec(xml)) !== null) {
      objects.push({ key: match[1], size: Number(match[2]) });
    }
    return { objects };
  }

  /** Presigned PUT URL for direct client uploads (replaces the R2/S3 stub URLs). */
  async presignPutUrl(key: string, expiresInSeconds: number, contentType?: string): Promise<string> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    const signed = await this.client.sign(
      new Request(url.toString(), { method: 'PUT', headers }),
      { aws: { signQuery: true } }
    );
    return signed.url;
  }

  /** Presigned GET URL for direct client downloads. */
  async presignGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    const signed = await this.client.sign(
      new Request(url.toString(), { method: 'GET' }),
      { aws: { signQuery: true } }
    );
    return signed.url;
  }
}

export function createB2Storage(config: B2Config): B2Storage {
  return new B2Storage(config);
}
```

Add unit tests at `packages/storage/src/index.test.ts` mirroring the style of
`packages/crypto/src/crypto.test.ts` — mock `fetch`/`AwsClient` and assert `put`/`get`/
`delete`/`list`/`presignPutUrl`/`presignGetUrl` build the expected requests.

---

## 4. Replace every `R2Bucket` usage

Search the repo for all touchpoints (run this first to confirm you caught everything —
the list below was accurate at time of writing but re-verify):

```bash
grep -rn "R2Bucket\|ATTACHMENTS_BUCKET\|r2_buckets\|r2\.example\.com\|r2_backup\|r2_upload\|r2_download" \
  --include="*.ts" --include="*.toml" --include="*.jsonc" .
```

For each file below, make the corresponding change:

### `apps/api-gateway/src/index.ts`
- Remove `ATTACHMENTS_BUCKET: R2Bucket;` from the `Bindings` type. Replace with:
  ```ts
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET_NAME: string;
  ```
- In `cleanupOrphanedFiles`, replace `await env.ATTACHMENTS_BUCKET.delete(...)` with a
  `createB2Storage(...)` instance built from the env vars above, then call `.delete(...)`.
  Import `createB2Storage` from `@qyx/storage`.

### `apps/api-gateway/src/services/files/file.routes.ts`
- Replace `ATTACHMENTS_BUCKET: R2Bucket;` in `FileBindings` with the same five `B2_*` fields
  as above.
- The `/upload-url` and `/:fileId/download-url` handlers currently return hardcoded stub URLs
  (`https://r2.example.com/...`). Replace these with real presigned URLs generated via
  `B2Storage.presignPutUrl` / `presignGetUrl` — see §4a below, this logic mostly belongs in
  `file.service.ts`.
- Rename the metrics `operation` values `'r2_upload'` / `'r2_download'` to `'b2_upload'` /
  `'b2_download'` for accuracy (check `packages/schemas` / any enum constraining allowed
  operation values and update it too).

### `apps/api-gateway/src/services/files/file.service.ts` (§4a)
- `FileService` currently builds a fake `uploadUrl` string directly. Change its constructor to
  also accept a `B2Storage` instance (or the raw `B2Config`, constructing `B2Storage`
  internally — match whatever pattern the rest of the services use for dependency injection in
  this codebase).
- In `requestUploadUrl`, replace:
  ```ts
  const uploadUrl = `https://r2.example.com/${r2Key}?sig=${crypto.randomUUID().replace(/-/g, '')}`;
  ```
  with a real presigned URL:
  ```ts
  const uploadUrl = await this.storage.presignPutUrl(objectKey, 300, data.mime_type);
  ```
  Rename the local variable `r2Key` → `objectKey` throughout this file for clarity (it's
  stored in the DB as `encrypted_storage_reference`, unchanged).
- Wherever `file.routes.ts`'s `/:fileId/download-url` handler builds its stub URL, move that
  into a `FileService.getDownloadUrl(fileId, userId)` method that calls
  `this.storage.presignGetUrl(file.encrypted_storage_reference, 300)`, keeping the route
  handler thin (matches the existing pattern where `FileService` owns the DB/storage logic).

### `workers/backup-worker/src/index.ts`
- Replace `ATTACHMENTS_BUCKET: R2Bucket;` in `Env` with the five `B2_*` fields.
- In `createR2Backup`, replace `env.ATTACHMENTS_BUCKET` with a `createB2Storage(...)` instance
  built from `env`. The `bucket.list()` / `bucket.get()` / `bucket.put()` calls map directly to
  `storage.list()` / `storage.get()` / `storage.put()` on the new client — logic stays the
  same, just swap the object.
- Rename the function `createR2Backup` → `createB2Backup` (and its call site in the
  `scheduled` handler) for accuracy.

### Test files
Update these to mock the new `B2Storage`/`@qyx/storage` shape instead of `R2Bucket`:
- `apps/api-gateway/src/index.test.ts`
- `apps/api-gateway/src/org-isolation.test.ts`
- `apps/api-gateway/src/performance/api-latency.test.ts`
- `apps/api-gateway/src/services/files/file.test.ts`

In each, replace the `ATTACHMENTS_BUCKET: { ... } as unknown as R2Bucket` mock objects with
either a real `B2Storage` instance pointed at a mocked `fetch`, or a lightweight fake object
matching the `B2Storage` public method surface (`put`/`get`/`delete`/`list`/`presignPutUrl`/
`presignGetUrl`) — follow whatever mocking convention the file already uses for `D1Database`.

---

## 5. Update Wrangler configs

In each of these files, **remove** the `[[r2_buckets]]` block(s):

- `apps/api-gateway/wrangler.toml` (three blocks: default, `env.staging`, `env.production`)
- `apps/api-gateway/wrangler.dev.toml`
- `apps/api-gateway/wrangler.staging.toml`
- `apps/api-gateway/wrangler.prod.toml`
- `workers/backup-worker/wrangler.toml`

Add non-secret config as `[vars]` (per environment) in each, e.g. in
`apps/api-gateway/wrangler.prod.toml`:

```toml
[vars]
B2_ENDPOINT = "s3.us-west-004.backblazeb2.com"
B2_REGION = "us-west-004"
B2_BUCKET_NAME = "qyx-attachments-prod"
```

Do **not** put `B2_KEY_ID` / `B2_APPLICATION_KEY` in `[vars]` — those are secrets. They're set
separately, per environment, via:

```bash
npx wrangler secret put B2_KEY_ID --env production
npx wrangler secret put B2_APPLICATION_KEY --env production
```

(repeat for `staging`/dev, and for the `backup-worker` project). If deploying through the
Cloudflare dashboard's Git integration (as set up previously), add these instead under
**Settings → Variables and Secrets** for each connected Worker project, marking the two key
fields as **Encrypted**.

Also check the root `wrangler.jsonc` — it doesn't currently declare `r2_buckets`, so no change
needed there, but confirm nothing was added since this doc was written.

---

## 6. Update the backup/restore tooling

### `scripts/configure-r2-lifecycle.ts`
This calls `wrangler r2 bucket lifecycle create`, which is R2-specific and has no B2
equivalent via Wrangler. Two options — pick whichever fits how this script is actually used;
if unsure, ask rather than guessing:
- **Simplest:** delete this script and configure B2 lifecycle rules manually once via the
  Backblaze dashboard (Bucket Settings → Lifecycle Settings), since B2's rule model
  (days-to-hide / days-to-delete) differs enough from R2's that a 1:1 script port isn't
  meaningful.
- **If automation is required:** rewrite it to call B2's native `b2_update_bucket` API
  (`https://api...backblazeb2.com/b2api/v3/b2_update_bucket`) with a `lifecycleRules` array
  using B2's schema (`fileNamePrefix`, `daysFromUploadingToHiding`,
  `daysFromHidingToDeleting`), authenticating via `b2_authorize_account` first.

### `scripts/restore.ts`
Update the `restoreBackup` function's printed instructions: replace the
`wrangler r2 bucket object copy ...` command examples with either:
- B2's CLI: `b2 file copy-by-name <source> <dest>`, or
- Any S3-compatible tool pointed at the B2 S3 endpoint (e.g. `aws s3 cp --endpoint-url
  https://<B2_ENDPOINT> ...`).

Update the `BackupManifest` interface's `r2_manifest` field name to something
provider-neutral like `storage_manifest` if you're touching this file anyway, and grep for
other places that field name is written/read (the backup-worker doesn't currently write this
manifest format at all — check whether that's a gap that predates this migration, and if so
leave a `// TODO` rather than inventing new backup-manifest-writing logic as part of a storage
swap).

---

## 7. Verify

After making all changes:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
grep -rn "R2Bucket\|r2_buckets\|r2\.example\.com" --include="*.ts" --include="*.toml" . 
# ^ should return nothing except possibly comments/docs (see §8)
```

Then do a real end-to-end check against the actual B2 bucket (not mocks): upload a small file
via the `/v1/files/upload-url` → PUT flow, confirm it lands in the B2 bucket via the Backblaze
dashboard, then fetch it back via `/v1/files/:fileId/download-url`.

---

## 8. Documentation (lower priority, do last)

`documentation/05-database-design.md`, `documentation/07-security-design.md`, and
`documentation/08-infrastructure-design.md` reference R2 by name as the storage layer. Do a
final pass to update these mentions to Backblaze B2 once the code changes are verified working
— this is a find-and-replace of prose, not a functional change, so don't let it block or get
mixed into the code-change commits.