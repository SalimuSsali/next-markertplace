/**
 * Image upload (R2) runs in the same Next.js app everywhere. Port 3000 is ONLY for
 * `npm run dev` on your machine — it is not "where production lives."
 * Official production: Vercel deploy + these env vars in the Vercel project (not in git).
 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
];

function clean(s) {
  if (s == null) return "";
  let t = String(s)
    .replace(/^\uFEFF/, "")
    .replace(/\u00A0/g, " ")
    .trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function statusForKey(name, v) {
  if (!v) return "missing";
  if (name === "R2_ACCOUNT_ID") {
    return /^[a-f0-9]{32}$/i.test(v) ? "ok (32 hex)" : "wrong shape (need 32 hex from R2 Overview)";
  }
  if (name === "R2_ACCESS_KEY_ID") {
    return v.length === 32 ? "ok (32 chars)" : `wrong length (${v.length}, need 32)`;
  }
  if (name === "R2_SECRET_ACCESS_KEY") {
    return v.length >= 20 ? "ok (secret present)" : "looks too short";
  }
  if (name === "R2_BUCKET_NAME") {
    return v.length > 0 ? "ok" : "missing";
  }
  if (name === "R2_PUBLIC_BASE_URL") {
    if (/r2\.cloudflarestorage\.com/i.test(v)) {
      return "wrong: use pub-….r2.dev (Public access), not the S3 API host";
    }
    return /^https?:\/\//i.test(v) ? "ok (URL present)" : "need https://…";
  }
  return "set";
}

const root = path.join(__dirname, "..");
const hasLocal = fs.existsSync(path.join(root, ".env.local"));

console.log(`
=== Production image upload (Cloudflare R2) — Vercel is the official host ===
• ${hasLocal ? "Found" : "No"} .env.local (gitignored). Values are NOT pushed to GitHub.
• Deployed code: git push → Vercel builds the same app/ and app/api/r2-upload/* as local.
• To make uploads work on https://your-app.vercel.app, copy these names + values into:
  Vercel → your project → Settings → Environment Variables → Production (and Preview if used)
  Then Redeploy.

Server-only variable names (paste values from Cloudflare R2 / your working .env.local):
`);
for (const k of R2_KEYS) console.log(`  • ${k}`);
console.log(`
Local .env.local sanity (values hidden):`);
if (!hasLocal) {
  console.log("  (skipped — add .env.local from .env.example)\n");
  process.exit(0);
}
let allOk = true;
for (const k of R2_KEYS) {
  const v = clean(process.env[k]);
  const st = statusForKey(k, v);
  if (!v || st.startsWith("wrong") || st === "missing") allOk = false;
  console.log(`  ${k}: ${st}`);
}
console.log(
  allOk
    ? "\n✓ Ready to mirror the same five keys into Vercel (Production), then redeploy.\n"
    : "\n⚠ Fix .env.local first, then copy the same values to Vercel.\n",
);
