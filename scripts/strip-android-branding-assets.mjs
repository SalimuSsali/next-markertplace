/**
 * Replace Android launcher + splash bitmaps with flat colors (no artwork / logo).
 * Safe for builds: keeps filenames Android references.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRes = path.join(root, "android", "app", "src", "main", "res");

const LAUNCHER_COLOR = "#0d9488"; // matches web themeColor
const SPLASH_COLOR = "#0d9488";

async function writeFlatPng(outPath, size, hex) {
  const buf = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: hex,
    },
  })
    .png()
    .toBuffer();
  await sharp(buf).toFile(outPath);
}

async function main() {
  if (!existsSync(androidRes)) {
    console.error("[strip-android-branding] Missing", androidRes);
    process.exit(1);
  }

  const splashFiles = [
    path.join(androidRes, "drawable", "splash.png"),
    ...[
      "drawable-land-hdpi",
      "drawable-land-mdpi",
      "drawable-land-xhdpi",
      "drawable-land-xxhdpi",
      "drawable-land-xxxhdpi",
      "drawable-port-hdpi",
      "drawable-port-mdpi",
      "drawable-port-xhdpi",
      "drawable-port-xxhdpi",
      "drawable-port-xxxhdpi",
    ].map((d) => path.join(androidRes, d, "splash.png")),
  ];

  for (const p of splashFiles) {
    if (!existsSync(p)) continue;
    await writeFlatPng(p, 512, SPLASH_COLOR);
  }

  const densities = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
  const launcherSizes = { "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192 };

  for (const folder of densities) {
    const dir = path.join(androidRes, folder);
    if (!existsSync(dir)) continue;
    const size = launcherSizes[folder] ?? 96;
    for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      const p = path.join(dir, name);
      if (existsSync(p)) {
        await writeFlatPng(p, size, LAUNCHER_COLOR);
      }
    }
  }

  console.log("[strip-android-branding] Replaced splash + launcher bitmaps with flat colors.");
}

main().catch((e) => {
  console.error("[strip-android-branding]", e?.message || e);
  process.exit(1);
});
