/**
 * @deprecated Prefer `npm run android:icons` (@capacitor/assets from `assets/icon.png`).
 * This script overwrites mipmaps from `public/icon-512.png` and can undo adaptive icons.
 * Only run `npm run android:icons:legacy` if you intentionally want that old path.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "icon-512.png");
const androidRes = path.join(root, "android", "app", "src", "main", "res");

/** density name → launcher size in px (square) */
const SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

async function main() {
  if (!existsSync(src)) {
    console.error("[android-icons] Missing", src, "— run npm run pwa:icons first.");
    process.exit(1);
  }
  if (!existsSync(androidRes)) {
    console.error(
      "[android-icons] Missing android res folder. Run: npx cap add android",
    );
    process.exit(1);
  }

  const input = sharp(src).ensureAlpha();

  for (const [folder, size] of Object.entries(SIZES)) {
    const dir = path.join(androidRes, folder);
    if (!existsSync(dir)) continue;

    const png = await input
      .clone()
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer();

    const launcher = path.join(dir, "ic_launcher.png");
    const round = path.join(dir, "ic_launcher_round.png");
    await sharp(png).toFile(launcher);
    await sharp(png).toFile(round);
  }

  console.log("[android-icons] Updated mipmap ic_launcher / ic_launcher_round from icon-512.png");
}

main().catch((e) => {
  console.error("[android-icons]", e?.message || e);
  process.exit(1);
});
