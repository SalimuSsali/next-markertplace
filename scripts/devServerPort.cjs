/**
 * Single source of truth for the local Next.js dev server port and URL.
 * Previously this project used 3010; all tooling now uses 3000 (Next default).
 * Update this file (and your CAPACITOR_SERVER_URL in .env.local) if you must change the port.
 */
const PORT = 3000;

function localhostOrigin() {
  return `http://localhost:${PORT}`;
}

/**
 * @param {"localhost"|"emulator10"} [kind] — emulator10 = Android emulator → host machine
 */
function devUrl(kind = "localhost") {
  if (kind === "emulator10") {
    // Android ADB reverse / 10.0.2.2 maps to the host; same port as local Next.
    return `http://10.0.2.2:${PORT}`;
  }
  return localhostOrigin();
}

module.exports = { PORT, localhostOrigin, devUrl };
