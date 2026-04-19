# Android Studio (Capacitor)

This repo wraps the **NEXT** web app in a native Android project so you can open **`android/`** in Android Studio.

The Next.js server is **not** bundled inside the APK. The WebView loads your app from **`CAPACITOR_SERVER_URL`** (production or dev). API routes, Firebase, and uploads work against that host.

## One-time setup

1. **Install dependencies** (from the project root):

   ```bash
   npm install
   ```

2. **Create the Android project** (only needed once):

   ```bash
   npx cap add android
   ```

3. **Production URL in the app** — `capacitor.config.ts` defaults the WebView to **`https://marketplace-app-woad.vercel.app`**. Run **`npm run android:sync`** so Android Studio picks up that URL (written under `android/app/src/main/assets/`).

   **Optional `.env.local`** — override for local Next on your PC (**Android emulator**, Next on port 3010):

   ```env
   CAPACITOR_SERVER_URL=http://10.0.2.2:3010
   ```

   Then run **`npm run android:sync`** again before building in Android Studio.

4. **Sync Capacitor** (after `android/` exists):

   ```bash
   npm run android:prepare
   ```

5. **Match launcher icons** to `public/icon-512.png` (mipmap folders):

   ```bash
   npm run android:assets
   ```

6. **Open in Android Studio**: File → Open → select the **`android`** folder (not the repo root).

7. Run on a device or emulator (green **Run** button).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run android:icons` | Regenerate `ic_launcher.png` / `ic_launcher_round.png` in all mipmap folders from `public/icon-512.png` |
| `npm run android:sync` | `cap sync android` (reads `.env.local` for `CAPACITOR_SERVER_URL`) |
| `npm run android:prepare` | PWA icons check + `cap sync` |
| `npm run android:assets` | PWA icons + Android mipmaps from `icon-512.png` + sync |
| `npm run android:open` | `cap open android` |

## Icons

- **Web / PWA**: `public/icon-192.png`, `public/icon-512.png` (see `npm run pwa:icons`).
- **Android**: after `cap add android`, run **`npm run android:icons`** so mipmaps match the same artwork.

Adaptive icon XML under `mipmap-anydpi-v26` still points at `ic_launcher` / `ic_launcher_foreground` — if you use adaptive icons, replace foreground drawables in Android Studio or extend the script.

## Requirements

- **JDK17+** (Android Studio bundles one).
- **Android SDK** via Android Studio.
- **Node 20.x** (see `package.json` engines).

## Repo / CI note

`android/.gitignore` excludes **`app/src/main/assets/public`** and the copied **`capacitor.config.json`** under assets (they are produced by `npx cap sync`). After cloning, run **`npm run android:prepare`** (and **`npm run android:assets`** when you change icons) before opening Android Studio.

## Config file

Root **`capacitor.config.ts`** is the source of truth. The CLI reads it when you run `cap sync`; the Android project then gets a generated copy under `android/app/src/main/assets/`.
