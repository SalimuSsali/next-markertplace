/**
 * Single source of truth for the local Next.js dev server port and dev URLs
 * (localhost, emulator `10.0.2.2`, and docs). Change only `PORT` here, then
 * match `CAPACITOR_SERVER_URL` in `.env.local` (e.g. `http://LAN_IP:PORT`).
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
