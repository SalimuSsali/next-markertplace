import { randomUUID } from "node:crypto";
import { logServerError } from "../../../lib/devLog";
import {
  getR2Config,
  getR2EnvShapeError,
  isR2ApiEndpointUrl,
  r2UploadErrorUserMessage,
  uploadImageToR2,
} from "../../../lib/r2";

export const runtime = "nodejs";
/** Vercel / Next: allow slow uploads to R2 (Hobby max is still 10s unless you upgrade). */
export const maxDuration = 60;

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
  const rawPublic = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
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

  let incoming;
  try {
    incoming = await req.formData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/1\s*mb|body.*limit|413|entity too large|payload too large/i.test(msg)) {
      return Response.json(
        {
          error: {
            message:
              "Request body too large for the server. Try a smaller image (under ~1 MB) or configure a higher limit for your host.",
          },
        },
        { status: 413 }
      );
    }
    return Response.json(
      { error: { message: "Invalid form data." } },
      { status: 400 }
    );
  }

  const file = incoming.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: { message: "Missing file." } }, { status: 400 });
  }

  const type = file.type || "";
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json(
      { error: { message: "Only JPEG, PNG, GIF, and WebP images are allowed." } },
      { status: 400 }
    );
  }

  const size = file.size;
  if (size > MAX_BYTES) {
    return Response.json(
      { error: { message: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).` } },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext =
    type === "image/jpeg"
      ? "jpg"
      : type === "image/png"
        ? "png"
        : type === "image/gif"
          ? "gif"
          : "webp";
  const stem = safeFileName(file.name).replace(/\.[^.]+$/, "") || "upload";
  // Keep the public URL simple: https://<public-base>/<filename>
  const key = `${Date.now()}-${randomUUID()}-${stem}.${ext}`;

  try {
    const url = await uploadImageToR2(config, key, buf, type);
    // Avoid an extra network round-trip on every upload.
    // Keep the probe opt-in for debugging only.
    if (process.env.R2_VERIFY_PUBLIC_URL === "1") {
      try {
        const probe = await fetch(url, { method: "HEAD", redirect: "follow" });
        if (!probe.ok) {
          return Response.json(
            {
              error: {
                message: `File uploaded, but the public URL is not reachable (HTTP ${probe.status}). Turn on public access for this bucket (R2 → bucket → Settings → Public access) and set R2_PUBLIC_BASE_URL to the exact r2.dev or custom-domain base URL Cloudflare shows.`,
              },
            },
            { status: 502 }
          );
        }
      } catch {
        // HEAD can fail (e.g. TLS from server); upload already succeeded — still return URL.
      }
    }
    return Response.json({ url, key });
  } catch (e) {
    logServerError("r2-upload", e);
    return Response.json(
      { error: { message: r2UploadErrorUserMessage(e) } },
      { status: 502 }
    );
  }
}
