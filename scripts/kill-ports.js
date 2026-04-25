const { execSync } = require("child_process");
const { PORT: CANONICAL_DEV_PORT } = require("./devServerPort.cjs");

/**
 * Frees the canonical Next dev port (see `devServerPort.cjs`) so `npm run dev` can bind.
 * To clear another port (e.g. a stuck process on a different number), run:
 * `node scripts/kill-ports.js 3010` — do not add broad port lists; that was killing unrelated local servers.
 */
const DEFAULT_DEV_PORTS = [CANONICAL_DEV_PORT];

function getListeningPids(port) {
  const cmd = `netstat -ano | findstr :${port} | findstr LISTENING`;
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
    if (!out) return [];
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

const argvPorts = process.argv.slice(2).filter(Boolean);
const ports = argvPorts.length > 0 ? argvPorts : DEFAULT_DEV_PORTS.map(String);

for (const p of ports) {
  const port = String(p).replace(/[^\d]/g, "");
  if (!port) continue;
  const pids = getListeningPids(port);
  for (const pid of pids) killPid(pid);
}

