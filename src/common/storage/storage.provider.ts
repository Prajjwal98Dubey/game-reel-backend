import { HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface PutOptions {
  contentType: string;
  cacheControl: string;
  contentEncoding?: string;
}

/** Object storage behind the CDN. Swap implementations (R2, S3, local disk) without touching callers. */
export interface StorageProvider {
  exists(key: string): Promise<boolean>;
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
}

export interface S3StorageConfig {
  bucket: string;
  /** Custom endpoint for S3-compatible stores such as Cloudflare R2; omit for AWS S3. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

/** Works with AWS S3 and Cloudflare R2 (region "auto"). */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound')
        return false;
      throw error;
    }
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        ContentEncoding: options.contentEncoding,
      }),
    );
  }
}
