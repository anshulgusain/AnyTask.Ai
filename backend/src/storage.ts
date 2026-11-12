import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Screenshot storage
// ---------------------------------------------------------------------------
// Local disk by default. Hosts like Render wipe the disk on every deploy/restart,
// so in production point SCREENSHOT_STORAGE=s3 at any S3-compatible bucket
// (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Files are always addressed by
// basename, and served back through GET /api/screenshots/:filename.
// ---------------------------------------------------------------------------

export const LOCAL_SCREENSHOT_DIR = path.resolve(process.cwd(), 'test-results', 'screenshots');

interface ScreenshotStore {
  save(filename: string, data: Buffer): Promise<void>;
  read(filename: string): Promise<Buffer | null>;
}

class LocalStore implements ScreenshotStore {
  async save(filename: string, data: Buffer): Promise<void> {
    await fs.mkdir(LOCAL_SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_SCREENSHOT_DIR, filename), data);
  }

  async read(filename: string): Promise<Buffer | null> {
    return fs.readFile(path.join(LOCAL_SCREENSHOT_DIR, filename)).catch(() => null);
  }
}

class S3Store implements ScreenshotStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('SCREENSHOT_STORAGE=s3 requires S3_BUCKET');
    this.bucket = bucket;
    this.prefix = (process.env.S3_PREFIX ?? 'screenshots/').replace(/^\/+/, '');
    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async save(filename: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.prefix + filename, Body: data, ContentType: 'image/png' })
    );
  }

  async read(filename: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.prefix + filename }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch {
      return null;
    }
  }
}

let store: ScreenshotStore | null = null;

export function screenshotStore(): ScreenshotStore {
  if (!store) store = process.env.SCREENSHOT_STORAGE === 's3' ? new S3Store() : new LocalStore();
  return store;
}
