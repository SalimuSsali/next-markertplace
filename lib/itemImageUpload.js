import { MAX_ITEM_IMAGES, optimizeImageFileForUpload, uploadImageFileToR2 } from "./itemImages";

/**
 * Decide how many new files can be added given existing image count.
 * @returns {{ action: "none" } | { action: "full" } | { action: "upload", batch: File[], truncated: boolean }}
 */
export function planItemImageFileBatch(files, existingUrlCount) {
  const list = Array.from(files ?? []);
  if (!list.length) return { action: "none" };
  const room = MAX_ITEM_IMAGES - existingUrlCount;
  if (room <= 0) return { action: "full" };
  const batch = list.slice(0, room);
  const truncated = list.length > batch.length;
  return { action: "upload", batch, truncated };
}

function withTimeout(promise, ms, label, fallback) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (typeof fallback !== "undefined") {
        if (typeof console !== "undefined") {
          console.warn(`[upload] ${label} timed out after ${Math.round(ms / 1000)}s — using fallback`);
        }
        resolve(fallback);
      } else {
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
      }
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function uploadItemImageBatch(batch) {
  const files = Array.from(batch ?? []);
  if (!files.length) return [];

  const CONCURRENCY = 3;
  const results = new Array(files.length);

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= files.length) return;
      const original = files[i];
      const optimized = await withTimeout(
        optimizeImageFileForUpload(original),
        20_000,
        "Image optimization",
        original,
      );
      results[i] = await uploadImageFileToR2(optimized);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
