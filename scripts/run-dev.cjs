const { spawn, execSync } = require("child_process");
const path = require("path");
const { PORT } = require("./devServerPort.cjs");

const root = path.join(__dirname, "..");
const q = (p) => `"${p}"`;

const genScript = path.join(__dirname, "gen-firebase-messaging-sw.mjs");
const killScript = path.join(__dirname, "kill-ports.js");
const openScript = path.join(__dirname, "open-browser.js");

process.chdir(root);

execSync(`node ${q(genScript)}`, { stdio: "inherit", shell: true, cwd: root });

try {
  execSync(`node ${q(killScript)}`, { stdio: "ignore", shell: true, cwd: root });
} catch {
  // ignore
}

const open = spawn(process.execPath, [openScript], { detached: true, stdio: "ignore", cwd: root });
open.unref();

const next = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  stdio: "inherit",
  shell: true,
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
});

next.on("exit", (code) => process.exit(code == null ? 0 : code));
next.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
