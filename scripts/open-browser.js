const { exec } = require("child_process");
const { localhostOrigin } = require("./devServerPort.cjs");

setTimeout(() => {
  // Allow override, e.g. OPEN_BROWSER_URL=http://127.0.0.1:3000
  const url = String(process.env.OPEN_BROWSER_URL || "").trim() || localhostOrigin();
  exec(`start chrome ${url}`);
}, 3000);

