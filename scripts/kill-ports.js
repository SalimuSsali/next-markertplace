const { execSync } = require("child_process");
const { PORT: CANONICAL_DEV_PORT } = require("./devServerPort.cjs");

/**
 * When no ports are passed on the command line, free these so the Next app on
 * `CANONICAL_DEV_PORT` (see devServerPort.cjs) can bind cleanly. Includes 3010 to
 * clear the old project default so nothing “sticks” to the previous port.
 */
const DEFAULT_DEV_PORTS = [
  CANONICAL_DEV_PORT,
  3001,
  3002,
  3003,
  3010,
  4000,
  4200,
  5000,
  5173,
  5174,
  8080,
  8888,
  9000,
];

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

