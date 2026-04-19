# Marketplace app (NEXT)

A Next.js marketplace client: Firestore listings, Firebase Auth, optional Cloudflare R2 image uploads, and client-side global search (ranked, debounced).

**Production:** [https://marketplace-app-woad.vercel.app/](https://marketplace-app-woad.vercel.app/)

## Project status

**This codebase is finalized for the current scope** — stable, production-oriented, and intentionally left open for future enhancements. New work (messaging, favorites persistence, admin tools, server-side search, etc.) can build on the existing layout: `app/` routes, `components/`, `hooks/`, and `lib/` helpers without restructuring the core.

### Authentication

- **Guest**: Users can browse listings without signing in.
- **Email/password** or **Google**: On Profile, choose how you want to post, then sign in. Enable **Email/Password** and/or **Google** in Firebase Console → Authentication → Sign-in method. For Google, add your app hostname under Authentication → Settings → **Authorized domains**.

## Requirements

- Node.js **20.9+** (matches `package.json` `engines`; Vercel uses this for builds)
- A Firebase project (Firestore + Authentication with **Email/Password** and/or **Google** enabled, matching Profile options)
- Optional: Cloudflare R2 bucket + API token for listing photos

## Setup (install and run)

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   - **Firebase**: Web app config from Firebase Console → Project settings → Your apps. All `NEXT_PUBLIC_FIREBASE_*` keys in `.env.example` are required for a working client. Turn on **Email/Password** and/or **Google** under Authentication → Sign-in method.
   - **R2** (optional; needed for multi-image uploads): set `R2_*` as in `.env.example`. The public URL must be your `r2.dev` or custom domain — not `*.r2.cloudflarestorage.com`.

3. **Development**

   ```bash
   npm run dev
   ```

  Open [http://localhost:3010](http://localhost:3010). If Turbopack misbehaves on your machine, run with `NEXT_DISABLE_TURBOPACK=1` (see `.env.example`).

4. **Production**

   ```bash
   npm run build
   npm start
   ```

   **`npm run build`** runs **`prebuild`** (PWA icon check) then **`next build`**. On **Vercel**, output goes to the default **`.next`** folder. On **local Windows**, `next.config.ts` may use **`.next-buildsafe5`** to reduce occasional permission issues with `.next`.

### Deploy on Vercel

1. Import the repo in [Vercel](https://vercel.com) and keep the default **Framework Preset: Next.js** (install: `npm install`, build: `npm run build`, output: handled by Next — no custom output directory in the Vercel UI).
2. Add **Environment Variables** from `.env.example`: all **`NEXT_PUBLIC_FIREBASE_*`** for Production (and Preview if needed). Add **`R2_*`** only if you use uploads; mark them as sensitive — they stay server-side for `app/api/r2-upload`.
3. After the first deploy, add your **`*.vercel.app`** hostname (and custom domain) under Firebase → Authentication → **Authorized domains**. For Google sign-in, add the same origins in Google Cloud Console → OAuth client **Authorized JavaScript origins** (e.g. `https://marketplace-app-woad.vercel.app`, etc.).

### Progressive Web App (install on mobile)

- **HTTPS (required in production)**  
  Chrome and other browsers only treat a site as installable over **HTTPS**, with the usual exception of **`http://localhost`** during development. Deploy behind TLS (Vercel, Cloudflare, your host’s reverse proxy, etc.); plain HTTP production URLs will **not** show “Add to Home Screen” / install prompts.

- **Manifest & service worker**  
  `public/manifest.json` (linked from `app/layout.js`) defines name, icons, `display: standalone`, and `start_url`. `public/sw.js` is registered after load from `components/ServiceWorkerRegister.js`. Chromium uses both for installability.

- **Icons**  
  Install prompts need **192×192** and **512×512** PNGs (`public/icon-192.png`, `public/icon-512.png`). `public/icon.svg` is listed as an extra fallback for clients that accept SVG. **`npm run build`** runs `scripts/ensure-pwa-icons.mjs` first; on Windows it can generate teal placeholders if files are missing. Otherwise run `npm run pwa:icons` or add the PNGs manually (and copy to `favicon.png` / `apple-touch-icon.png` if needed).

- **Install UI**  
  When the browser fires `beforeinstallprompt` (Chrome / Edge / Android Chromium), `components/PwaInstallBanner.js` shows an **Install** action. **Safari on iOS** does not support that event; users install via **Share → Add to Home Screen**.

## Architecture (extension points)

| Area | Location | Notes |
|------|----------|--------|
| Pages / routes | `app/` | App Router; add routes as new folders. `/categories` redirects to `/items`. |
| HTTP API | `app/api/` | e.g. R2 upload; add handlers here for new server features. |
| UI | `components/` | Shared chrome: bottom tab bar (main nav), search highlights, expiry warnings. |
| Hooks | `hooks/` | e.g. auth, debounced values — reuse for new interactive features. |
| Domain logic | `lib/` | Firebase (`firebase.js`), **global search** (`globalSearch.js`), item fields (`itemFields.js`), images, notifications, R2, validation. |

**Search**: Ranking, spell correction, and debouncing live in `lib/globalSearch.js` and are wired on the home page, items list, and shop detail. For very large catalogs, consider replacing or augmenting with a hosted search index while keeping the same UI hooks.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve production build |

## Further detail

For a concise handoff checklist (placeholders, known gaps), see **[PROGRESS.md](./PROGRESS.md)**.
