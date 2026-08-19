import { AwsClient } from 'aws4fetch';

export interface B2Config {
  keyId: string;
  applicationKey: string;
  endpoint: string;
  region: string;
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

export class B2Storage {
  private client: AwsClient;
  private baseUrl: string;

  constructor(config: B2Config) {
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
