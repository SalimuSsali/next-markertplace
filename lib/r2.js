import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 uses the S3 API. Configure in .env.local (see .env.example).
 * In the R2 dashboard: create a bucket, an API token with Object Read & Write,
 * and enable public access via an r2.dev subdomain or a custom domain.
 */

/** S3 API hostname — not valid for browser image URLs. */
export function isR2ApiEndpointUrl(url) {
  return /r2\.cloudflarestorage\.com/i.test(String(url ?? ""));
}

/** R2 S3-compatible access key IDs are 32 characters (create token under R2 → Manage R2 API Tokens). */
const R2_ACCESS_KEY_ID_LEN = 32;

export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  if (isR2ApiEndpointUrl(publicBaseUrl)) {
    return null;
  }
  if (accessKeyId.length !== R2_ACCESS_KEY_ID_LEN) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

/**
 * When R2 env vars look filled in but are shaped wrong, return a specific hint (else null).
 */
export function getR2EnvShapeError() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  if (isR2ApiEndpointUrl(publicBaseUrl)) {
    return null;
  }
  if (accessKeyId.length !== R2_ACCESS_KEY_ID_LEN) {
    return `R2_ACCESS_KEY_ID must be exactly ${R2_ACCESS_KEY_ID_LEN} characters (the "Access Key ID" from R2 → Manage R2 API Tokens → Create API token). A short value usually means the wrong field was copied — not the Account ID, bucket name, or another service's API key.`;
  }
  return null;
}

/** @param {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string, publicBaseUrl: string }} config */
export function getR2Client(config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // AWS SDK v3.730+ started sending CRC32/flexible checksums by default,
    // which Cloudflare R2 can't negotiate cleanly and fails with TLS
    // alert 40 / handshake errors mid-upload. Disable unless required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** @param {{ publicBaseUrl: string }} config */
export function publicUrlForKey(config, key) {
  const k = String(key).replace(/^\//, "");
  return `${config.publicBaseUrl}/${k}`;
}

/**
 * Map S3/R2 errors to a short message safe to return from the API.
 * In development, includes the underlying message for easier debugging.
 * @param {unknown} err
 */
export function r2UploadErrorUserMessage(err) {
  const isDev = process.env.NODE_ENV === "development";
  const rawMsg = err instanceof Error ? err.message : String(err ?? "");
  const name =
    err && typeof err === "object" && err !== null && "name" in err
      ? String(/** @type {{ name?: unknown }} */ (err).name ?? "")
      : "";
  const code =
    err && typeof err === "object" && err !== null && "Code" in err
      ? String(/** @type {{ Code?: unknown }} */ (err).Code ?? "")
      : "";
  const key = (code || name).trim();

  if (isDev && rawMsg) {
    return key ? `[${key}] ${rawMsg}` : rawMsg;
  }

  switch (key) {
    case "InvalidArgument":
      if (/access key.*32|length \d+.*32/i.test(rawMsg)) {
        return `R2_ACCESS_KEY_ID must be exactly ${R2_ACCESS_KEY_ID_LEN} characters from R2 → Manage R2 API Tokens (not Account ID or other keys).`;
      }
      break;
    case "AccessDenied":
    case "Forbidden":
      return "Storage access denied. Confirm your R2 API token can write objects to this bucket.";
    case "InvalidAccessKeyId":
    case "SignatureDoesNotMatch":
      return "Invalid R2 API credentials. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.";
    case "NoSuchBucket":
      return "R2 bucket not found. Check R2_BUCKET_NAME matches your bucket.";
    case "NetworkingError":
    case "TimeoutError":
      return "Could not reach Cloudflare R2. Check R2_ACCOUNT_ID and your connection.";
    default:
      break;
  }

  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(rawMsg)) {
    return "Could not connect to R2. Check R2_ACCOUNT_ID and your network.";
  }
  if (/Access Denied/i.test(rawMsg)) {
    return "Storage access denied. Confirm your R2 API token can write objects to this bucket.";
  }
  const diag = [key, rawMsg].filter(Boolean).join(": ").slice(0, 220);
  return diag
    ? `Upload to storage failed (${diag}).`
    : "Upload to storage failed. Check server logs.";
}

/** @param {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string, publicBaseUrl: string }} config */
export async function uploadImageToR2(config, key, body, contentType) {
  const client = getR2Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return publicUrlForKey(config, key);
}

/**
 * Create a short-lived signed PUT URL so the browser can upload directly to R2.
 * @param {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string, publicBaseUrl: string }} config
 * @param {string} key
 * @param {string} contentType
 * @param {{ expiresInSeconds?: number } | undefined} opts
 */
export async function presignPutObjectUrl(config, key, contentType, opts) {
  const client = getR2Client(config);
  const expiresIn = Math.max(
    15,
    Math.min(10 * 60, Number(opts?.expiresInSeconds ?? 60))
  );
  const cmd = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  return await getSignedUrl(client, cmd, { expiresIn });
}
