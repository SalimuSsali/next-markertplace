import dns from "node:dns";
import * as https from "node:https";
import { URL } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

/** For `https.Agent`: A records only (avoids AAAA/IPv6 TLS issues to R2 on some hosts). */
function r2AgentLookupV4Only(hostname, _options, callback) {
  if (typeof hostname !== "string" || !hostname) {
    callback(new TypeError("Invalid hostname"));
    return;
  }
  dns.resolve4(hostname, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    const ip = addresses?.[0];
    if (typeof ip !== "string" || !ip) {
      callback(new Error(`No A record for ${hostname}`));
      return;
    }
    callback(null, ip, 4);
  });
}

function getR2SdkHttpsAgent() {
  return new https.Agent({
    keepAlive: true,
    maxSockets: 20,
    lookup: r2AgentLookupV4Only,
  });
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
    requestHandler: new NodeHttpHandler({
      httpsAgent: getR2SdkHttpsAgent(),
      connectionTimeout: 30_000,
      socketTimeout: 120_000,
    }),
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
    return "R2 connection misconfigured on the server. Redeploy the latest app; if it persists, confirm R2_ACCOUNT_ID and env vars on Vercel.";
  }
  if (/SSL alert number 40|handshake failure|EPROTO/i.test(rawMsg)) {
    return "Could not complete TLS to Cloudflare R2. The app now connects to IPv4 (A record) only. Redeploy, then confirm R2_ACCOUNT_ID and R2 API token on Vercel match Cloudflare.";
  }
  if (/fetch failed|TypeError:/i.test(rawMsg) && /EPROTO|SSL alert|handshake|certificate|TLS|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(rawMsg)) {
    return "Could not reach Cloudflare R2 over HTTPS. If you see SSL / handshake in the details, confirm R2_ACCOUNT_ID and bucket CORS; try again on a stable network.";
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
 * Presigned one-shot PUT: connect to the bucket host’s **IPv4 A record**, SNI = hostname
 * (certificate is for *.r2.cloudflarestorage.com). Avoids broken IPv6 paths from some clouds.
 * @param {string} putUrl
 * @param {Buffer} buf
 * @param {string} contentType
 */
async function uploadViaPresignedHttpsPut(putUrl, buf, contentType) {
  const u = new URL(putUrl);
  const name = u.hostname;
  if (!name) throw new TypeError("Presigned URL has no host");

  let address;
  try {
    const addrs = await dns.promises.resolve4(name);
    address = addrs[0];
  } catch (e) {
    throw new Error(
      `R2 DNS: could not resolve IPv4 for ${name}: ${errorMessageWithCause(e)}`,
    );
  }
  if (typeof address !== "string" || !address) {
    throw new TypeError(`No A record for ${name}`);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: address,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "PUT",
        servername: name,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": CACHE_HEADER,
          "Content-Length": String(buf.length),
        },
        minVersion: "TLSv1.2",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(undefined);
            return;
          }
          const text = Buffer.concat(chunks).toString("utf8").trim().slice(0, 400);
          reject(new Error(`R2 HTTP ${res.statusCode}${text ? `: ${text}` : ""}`));
        });
      },
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
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
 * Server-side upload: try presigned PUT first, then SDK PutObject. Either path
 * can fail on some hosts (TLS / checksum quirks); the other often succeeds.
 * @param {Buffer} body
 * @param {string} contentType
 */
export async function uploadImageToR2(config, key, body, contentType) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const putUrl = await presignPutObjectUrl(config, key, contentType, {
    expiresInSeconds: 5 * 60,
  });

  let presignErr;
  try {
    await uploadViaPresignedHttpsPut(putUrl, buf, contentType);
    return publicUrlForKey(config, key);
  } catch (e) {
    presignErr = e;
  }

  try {
    await uploadViaS3ClientPutObject(config, key, buf, contentType);
    return publicUrlForKey(config, key);
  } catch (sdkErr) {
    const a = errorMessageWithCause(presignErr);
    const b = errorMessageWithCause(sdkErr);
    throw new Error(`R2 upload failed. Presigned PUT: ${a}. SDK PutObject: ${b}`);
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
