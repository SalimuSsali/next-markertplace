/**
 * One-shot: push non-empty keys from .env.local to Vercel Production + Preview.
 * Requires: linked project (`npx vercel link`), logged-in CLI.
 * Usage: node scripts/vercel-sync-env-from-local.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");
const text = readFileSync(envPath, "utf8");
const vars = {};
for (const line of text.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (v === "") continue;
  if (!k.startsWith("NEXT_PUBLIC_FIREBASE_") && k !== "CAPACITOR_SERVER_URL") {
    continue;
  }
  vars[k] = v;
}

const targets = ["production", "preview"];
for (const env of targets) {
  for (const [key, value] of Object.entries(vars)) {
    const r = spawnSync(
      "npx",
      ["vercel", "env", "add", key, env, "--value", value, "--yes", "--force"],
      { cwd: root, stdio: "inherit", shell: true },
    );
    if (r.status !== 0) {
      process.exit(r.status ?? 1);
    }
  }
}
console.log("Synced:", Object.keys(vars).join(", "), "→", targets.join(", "));
