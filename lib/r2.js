import dns from "node:dns";
import { URL } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

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

/** R2 “Account ID” in the dashboard is 32 hex chars (used in the S3 API host). */
function isPlausibleR2AccountId(s) {
  return /^[a-f0-9]{32}$/i.test(String(s ?? "").trim());
}

export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  if (!isPlausibleR2AccountId(accountId)) {
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
  if (!isPlausibleR2AccountId(accountId)) {
    return "R2_ACCOUNT_ID must be the 32-character hex value from R2 → Overview (S3 API). Wrong values cause TLS/API errors. It is not the bucket name and has no extra spaces or quotes.";
  }
  if (isR2ApiEndpointUrl(publicBaseUrl)) {
    return null;
  }
  if (accessKeyId.length !== R2_ACCESS_KEY_ID_LEN) {
    return `R2_ACCESS_KEY_ID must be exactly ${R2_ACCESS_KEY_ID_LEN} characters (the "Access Key ID" from R2 → Manage R2 API Tokens → Create API token). A short value usually means the wrong field was copied — not the Account ID, bucket name, or another service's API key.`;
  }
  return null;
}

/**
 * S3 client for R2. Do not pass a custom `NodeHttpHandler` + `https.Agent` on serverless
 * (Vercel): that stack has produced "Invalid IP address: undefined" with @smithy/node-http-handler.
 * The SDK default handler + `dns.setDefaultResultOrder("ipv4first")` is reliable for R2.
 * @param {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string, publicBaseUrl: string }} config
 */
export function getR2Client(config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    // Virtual-hosted style (`bucket.accountId.r2...`) often fails TLS in browsers
    // (ERR_SSL_VERSION_OR_CIPHER_MISMATCH) and can fail Node handshakes (SSL alert 40)
    // because the cert is issued for `*.r2.cloudflarestorage.com`, not two labels deep.
    // Path-style: `https://accountId.../bucket/key` — R2 + AWS SDK use this.
    forcePathStyle: true,
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

/** @param {unknown} err */
function errorMessageWithCause(err) {
  if (!(err instanceof Error)) return String(err ?? "");
  const parts = [err.message];
  let c = /** @type {{ cause?: unknown }} */ (err).cause;
  let depth = 0;
  while (c instanceof Error && depth < 5) {
    parts.push(c.message);
    c = /** @type {{ cause?: unknown }} */ (c).cause;
    depth += 1;
  }
  return parts.join(" — ");
}

/**
 * Map S3/R2 errors to a short message safe to return from the API.
 * In development, includes the underlying message for easier debugging.
 * @param {unknown} err
 */
export function r2UploadErrorUserMessage(err) {
  const isDev = process.env.NODE_ENV === "development";
  const rawMsg = errorMessageWithCause(err);
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

  if (/Invalid IP address:\s*undefined/i.test(rawMsg)) {
    return "R2 upload failed on the server (SDK networking). After redeploy, add the same R2 env vars in Vercel: Project → Settings → Environment Variables — R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL (Production and Preview if you use them).";
  }
  if (/SSL alert number 40|handshake failure|EPROTO/i.test(rawMsg)) {
    return "Could not complete TLS to Cloudflare R2. In Vercel: set R2_ACCOUNT_ID (32 hex chars from R2 → Overview), R2_ACCESS_KEY_ID (32 chars) + R2_SECRET_ACCESS_KEY (from the same S3 API token), R2_BUCKET_NAME, R2_PUBLIC_BASE_URL (https://pub-…r2.dev, not the r2.cloudflarestorage.com API URL). No spaces or quotes. Redeploy after changes.";
  }
  if (/fetch failed|TypeError:/i.test(rawMsg) && /EPROTO|SSL alert|handshake|certificate|TLS|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(rawMsg)) {
    return "Could not reach Cloudflare R2 over HTTPS. Check R2_ACCOUNT_ID, API token, and bucket; ensure the public R2 URL is correct. Try again on a stable network.";
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

const CACHE_HEADER = "public, max-age=31536000, immutable";

/**
 * Presigned PUT to R2 using global `fetch` (Undici on Node 18+ / Vercel). Often succeeds when
 * `https.request` or the AWS SDK hit TLS handshake quirks on serverless.
 * @param {string} putUrl
 * @param {Buffer} buf
 * @param {string} contentType
 */
async function uploadViaPresignedFetchPut(putUrl, buf, contentType) {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available in this Node runtime");
  }
  const res = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
    },
    body: buf,
  });
  if (res.ok) return;
  const text = (await res.text().catch(() => "")).trim().slice(0, 400);
  throw new Error(`R2 HTTP ${res.status}${text ? `: ${text}` : ""}`);
}

/**
 * S3Client PutObject — different TLS / framing than a raw presigned PUT; use if HTTPS PUT fails.
 * @param {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string, publicBaseUrl: string }} config
 * @param {string} key
 * @param {Buffer} buf
 * @param {string} contentType
 */
async function uploadViaS3ClientPutObject(config, key, buf, contentType) {
  const client = getR2Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: CACHE_HEADER,
    }),
  );
}

/**
 * Server-side upload: try SDK PutObject, then presigned `fetch` PUT (good TLS on Vercel).
 * @param {Buffer} body
 * @param {string} contentType
 */
export async function uploadImageToR2(config, key, body, contentType) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);

  let sdkErr;
  try {
    await uploadViaS3ClientPutObject(config, key, buf, contentType);
    return publicUrlForKey(config, key);
  } catch (e) {
    sdkErr = e;
  }

  let putUrl;
  try {
    putUrl = await presignPutObjectUrl(config, key, contentType, {
      expiresInSeconds: 5 * 60,
    });
  } catch (signErr) {
    throw new Error(
      `R2 upload failed. SDK: ${errorMessageWithCause(sdkErr)}. Could not create presigned URL: ${errorMessageWithCause(signErr)}`,
    );
  }
  try {
    await uploadViaPresignedFetchPut(putUrl, buf, contentType);
    return publicUrlForKey(config, key);
  } catch (fetchErr) {
    const a = errorMessageWithCause(sdkErr);
    const b = errorMessageWithCause(fetchErr);
    throw new Error(`R2 upload failed. SDK PutObject: ${a}. Presigned (fetch) PUT: ${b}`);
  }
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
    CacheControl: CACHE_HEADER,
  });
  return await getSignedUrl(client, cmd, { expiresIn });
}
