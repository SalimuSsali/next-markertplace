import type { NextConfig } from "next";
import path from "node:path";

/**
 * - Vercel: always `.next` (VERCEL=1).
 * - Local: `.next` in the repo by default.
 *   Note: Next 16 + Turbopack requires `distDir` to stay within the project root; output dirs that
 *   navigate outside (e.g. via `..\..\Temp\...`) can cause Turbopack build failures.
 *   Override with NEXT_DIST_DIR (must be inside the project) if needed.
 */
function getDistDir(): string {
  const explicit = process.env.NEXT_DIST_DIR?.trim().replace(/[/\\]+$/, "");
  if (explicit) {
    // Allow either relative paths or absolute paths *inside* the project.
    const projectRoot = process.cwd();
    const abs = path.isAbsolute(explicit)
      ? path.normalize(explicit)
      : path.resolve(projectRoot, explicit);
    const rel = path.relative(projectRoot, abs);

    // Reject values that navigate outside the project; Turbopack doesn't allow it.
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return ".next";

    return rel.replace(/\\/g, "/");
  }
  if (process.env.VERCEL === "1") return ".next";
  return ".next";
}

/** Hosts (no port) allowed to use Next.js dev HMR from another origin, e.g. phone → http://LAN_IP:3000 */
function getAllowedDevOrigins(): string[] {
  return (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
    .split(/[,\n]+/)
    .map((s) => s.trim().replace(/^https?:\/\//, ""))
    .map((s) => (s.includes(":") ? s.split(":")[0]! : s))
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedDevOrigins = getAllowedDevOrigins();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: getDistDir(),
  typedRoutes: false,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),

  async redirects() {
    return [
      { source: "/property", destination: "/rentals", permanent: true },
      { source: "/property/:id", destination: "/rentals/:id", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
