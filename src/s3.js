import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET;

if (!region || !bucket) {
  throw new Error('AWS_REGION and S3_BUCKET must be configured in .env');
}

// No credentials are hard-coded. AWS SDK v3 uses its default credential
// provider chain (environment variables, AWS profile, IAM role, etc.).
export const s3 = new S3Client({ region });

export async function checkBucket() {
  await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: 'uploads/', MaxKeys: 1 }),
  );
  return { bucket, region };
}

export async function listFiles() {
  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: 'uploads/', MaxKeys: 100 }),
  );

  return (result.Contents ?? [])
    .filter((item) => item.Key)
    .map((item) => ({
      key: item.Key,
      size: item.Size ?? 0,
      lastModified: item.LastModified ?? null,
    }));
}

export async function uploadFile({ key, body, contentType }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      ServerSideEncryption: 'AES256',
    }),
  );
}

export async function createDownloadUrl(key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 300 },
  );
}

export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export { bucket, region };
