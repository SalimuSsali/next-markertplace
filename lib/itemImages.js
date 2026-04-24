/**
 * Listings may store `imageUrls` (array) and/or legacy `imageUrl` (string).
 * Same shape is used for items, shops, and services.
 */

export const MAX_ITEM_IMAGES = 10;

/** Must match server allowlist in `app/api/r2-upload` and `app/api/r2-upload-url`. */
const R2_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function guessMimeFromFileName(name) {
  const base = String(name ?? "")
    .split(/[/\\]/)
    .pop()
    ?.toLowerCase();
  if (!base) return "";
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1) : "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
}

/**
 * Android WebView / Capacitor often yields `File` with empty `type` even for JPEG/PNG.
 * Presign + multipart handlers require a known MIME from the allowlist.
 * @param {File} file
 */
function fileForR2Upload(file) {
  const raw = String(file?.type ?? "").trim().toLowerCase();
  if (R2_UPLOAD_MIME.has(raw)) return file;
  const guessed = guessMimeFromFileName(file?.name);
  if (!R2_UPLOAD_MIME.has(guessed)) return file;
  if (raw === guessed) return file;
  return new File([file], file.name || "upload", {
    type: guessed,
    lastModified: file.lastModified,
  });
}

const OPT_MAX_EDGE = 1600;
const OPT_QUALITY = 0.82;
const OPT_TARGET_TYPE = "image/webp";

function shouldOptimize(type) {
  const t = String(type || "").toLowerCase();
  if (t === "image/gif") return false;
  return t === "image/jpeg" || t === "image/png" || t === "image/webp";
}

async function decodeBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  // Fallback: HTMLImageElement (older WebViews)
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Client-side optimization to speed up uploads on mobile networks.
 * - Resizes large images (max edge 1600px)
 * - Re-encodes as WebP (except GIF)
 * Fallback: returns original file if optimization fails.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function optimizeImageFileForUpload(file) {
  try {
    if (!file || typeof file.size !== "number") return file;
    if (!shouldOptimize(file.type)) return file;

    // If already small-ish, skip work.
    if (file.size <= 500 * 1024) return file;

    const bmp = await decodeBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;

    const maxEdge = Math.max(w, h);
    const scale = maxEdge > OPT_MAX_EDGE ? OPT_MAX_EDGE / maxEdge : 1;
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(outW, outH)
        : Object.assign(document.createElement("canvas"), { width: outW, height: outH });

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, outW, outH);

    /** @type {Blob | null} */
    let blob = null;
    if ("convertToBlob" in canvas) {
      blob = await canvas.convertToBlob({ type: OPT_TARGET_TYPE, quality: OPT_QUALITY });
    } else {
      blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), OPT_TARGET_TYPE, OPT_QUALITY),
      );
    }
    if (!blob) return file;

    // If optimization didn't help, keep original.
    if (blob.size >= file.size) return file;

    const safeStem = (file.name || "upload").replace(/\.[^.]+$/, "");
    const outName = `${safeStem}.webp`;
    return new File([blob], outName, { type: OPT_TARGET_TYPE });
  } catch {
    return file;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @returns {string[]}
 */
export function getItemImageUrls(item) {
  const raw = item?.imageUrls;
  if (Array.isArray(raw)) {
    const list = raw
      .filter((u) => typeof u === "string")
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length > 0) return list;
  }
  const single = item?.imageUrl;
  if (typeof single === "string" && single.trim()) return [single.trim()];
  return [];
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @returns {string}
 */
export function getItemPrimaryImageUrl(item) {
  const urls = getItemImageUrls(item);
  return urls[0] ?? "";
}

/**
 * @param {string[]} urls
 * @returns {{ imageUrl: string, imageUrls: string[] }}
 */
export function imageFieldsForFirestore(urls) {
  const clean = urls.map((u) => String(u).trim()).filter(Boolean);
  const primary = clean[0] ?? "";
  return {
    imageUrl: primary,
    imageUrls: clean,
  };
}

/**
 * Absolute upload URL for the current page origin (WebView / Capacitor-safe).
 * Relative `/api/...` can mis-resolve in some embedded browsers.
 */
export function getR2UploadEndpoint() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "/api/r2-upload";
  }
  try {
    return new URL("/api/r2-upload", window.location.origin).href;
  } catch {
    return "/api/r2-upload";
  }
}

export function getR2UploadUrlEndpoint() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "/api/r2-upload-url";
  }
  try {
    return new URL("/api/r2-upload-url", window.location.origin).href;
  } catch {
    return "/api/r2-upload-url";
  }
}

/**
 * @param {File} file
 * @returns {Promise<string>} public URL
 */
export async function uploadImageFileToR2(file) {
  const uploadFile = fileForR2Upload(file);
  let fastPathInitError = null;
  let fastPathPutError = null;
  try {
    const metaRes = await fetch(getR2UploadUrlEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: uploadFile?.name ?? "upload",
        type: uploadFile?.type ?? "",
        size: uploadFile?.size ?? 0,
      }),
      credentials: "same-origin",
    });
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      throw new Error(
        meta?.error?.message
          ? String(meta.error.message)
          : `Upload init failed (HTTP ${metaRes.status}).`
      );
    }
    if (!meta?.uploadUrl || !meta?.url) throw new Error("Upload init did not return a URL.");

    try {
      const putRes = await fetch(String(meta.uploadUrl), {
        method: "PUT",
        headers: { "Content-Type": String(uploadFile?.type ?? "application/octet-stream") },
        body: uploadFile,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (HTTP ${putRes.status}).`);
      }
      return String(meta.url);
    } catch (putErr) {
      fastPathPutError = putErr;
      if (typeof console !== "undefined") {
        console.warn(
          "[upload] Direct R2 PUT failed — likely a missing bucket CORS policy. Falling back to server upload. Error:",
          putErr,
        );
      }
    }
  } catch (initErr) {
    fastPathInitError = initErr;
    if (typeof console !== "undefined") {
      console.warn("[upload] R2 presign init failed — falling back to server upload. Error:", initErr);
    }
  }

  const form = new FormData();
  form.append("file", uploadFile);
  const res = await fetch(getR2UploadEndpoint(), {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const serverMessage = data?.error?.message
      ? String(data.error.message)
      : `Upload failed (HTTP ${res.status}).`;
    if (typeof console !== "undefined" && (fastPathInitError || fastPathPutError)) {
      console.error(
        "[upload] Server upload also failed. Fast-path init error:",
        fastPathInitError,
        "Fast-path PUT error:",
        fastPathPutError,
        "Server error:",
        serverMessage,
      );
    }
    throw new Error(serverMessage);
  }
  if (!data?.url) throw new Error("Upload did not return a URL.");
  return String(data.url);
}
