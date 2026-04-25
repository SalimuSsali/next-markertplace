import { randomUUID } from "node:crypto";
import { logServerError } from "../../../lib/devLog";
import {
  cleanR2EnvString,
  getR2Config,
  getR2EnvShapeError,
  isR2ApiEndpointUrl,
  presignPutObjectUrl,
  publicUrlForKey,
  r2UploadErrorUserMessage,
} from "../../../lib/r2";

export const runtime = "nodejs";

const WRONG_PUBLIC_URL_MSG =
  "R2_PUBLIC_BASE_URL must be your bucket’s public URL (r2.dev or custom domain), e.g. https://pub-xxxxxx.r2.dev — not https://…r2.cloudflarestorage.com (that URL is only for the S3 API). In R2: open your bucket → Settings → Public access → allow r2.dev or connect a custom domain.";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function safeFileName(name) {
  const base = String(name ?? "image").split(/[/\\]/).pop() || "image";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

export async function POST(req) {
  const rawPublic = cleanR2EnvString(process.env.R2_PUBLIC_BASE_URL);
  if (rawPublic && isR2ApiEndpointUrl(rawPublic)) {
    return Response.json({ error: { message: WRONG_PUBLIC_URL_MSG } }, { status: 400 });
  }

  const shapeError = getR2EnvShapeError();
  if (shapeError) {
    return Response.json({ error: { message: shapeError } }, { status: 503 });
  }

  const config = getR2Config();
  if (!config) {
    return Response.json(
      {
        error: {
          message: rawPublic
            ? WRONG_PUBLIC_URL_MSG
            : "R2 is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL to your environment.",
        },
      },
      { status: 503 }
    );
  }

  /** @type {{ filename?: string, type?: string, size?: number } | null} */
  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const type = String(body?.type ?? "");
  const size = Number(body?.size ?? NaN);
  const filename = safeFileName(body?.filename ?? "upload");

  if (!ALLOWED_TYPES.has(type)) {
    return Response.json(
      { error: { message: "Only JPEG, PNG, GIF, and WebP images are allowed." } },
      { status: 400 }
    );
  }
  if (!Number.isFinite(size) || size <= 0) {
    return Response.json({ error: { message: "Missing file size." } }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return Response.json(
      { error: { message: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).` } },
      { status: 400 }
    );
  }

  const ext =
    type === "image/jpeg"
      ? "jpg"
      : type === "image/png"
        ? "png"
        : type === "image/gif"
          ? "gif"
          : "webp";
  const stem = filename.replace(/\.[^.]+$/, "") || "upload";
  const key = `${Date.now()}-${randomUUID()}-${stem}.${ext}`;

  try {
    const uploadUrl = await presignPutObjectUrl(config, key, type, { expiresInSeconds: 90 });
    const url = publicUrlForKey(config, key);
    return Response.json({ uploadUrl, url, key, method: "PUT" });
  } catch (e) {
    logServerError("r2-upload-url", e);
    return Response.json(
      { error: { message: r2UploadErrorUserMessage(e) } },
      { status: 502 }
    );
  }
}

