import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v2 as cloudinary } from 'cloudinary';

// ---------------------------------------------------------------------------
// Screenshot storage
// ---------------------------------------------------------------------------
// Local disk by default. Hosts like Render wipe the disk on every deploy/restart,
// so in production use SCREENSHOT_STORAGE=cloudinary, or SCREENSHOT_STORAGE=s3 for any
// S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Files are always
// addressed by basename, and served back through GET /api/screenshots/:filename.
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

class CloudinaryStore implements ScreenshotStore {
  private readonly folder: string;

  constructor() {
    // The SDK reads CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> on its own.
    if (!process.env.CLOUDINARY_URL) throw new Error('SCREENSHOT_STORAGE=cloudinary requires CLOUDINARY_URL');
    cloudinary.config({ secure: true });
    this.folder = (process.env.CLOUDINARY_FOLDER ?? 'anytask').replace(/^\/+|\/+$/g, '');
  }

  private publicId(filename: string): string {
    return `${this.folder}/${filename.replace(/\.png$/i, '')}`;
  }

  async save(filename: string, data: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { public_id: this.publicId(filename), resource_type: 'image', overwrite: true, format: 'png' },
          (err) => (err ? reject(err) : resolve())
        )
        .end(data);
    });
  }

  async read(filename: string): Promise<Buffer | null> {
    const url = cloudinary.url(this.publicId(filename), { format: 'png', secure: true });
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

let store: ScreenshotStore | null = null;

export function screenshotStore(): ScreenshotStore {
  if (!store) {
    const kind = process.env.SCREENSHOT_STORAGE;
    store = kind === 's3' ? new S3Store() : kind === 'cloudinary' ? new CloudinaryStore() : new LocalStore();
  }
  return store;
}
