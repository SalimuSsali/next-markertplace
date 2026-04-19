import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(__dirname, ".env.local") });
loadEnv({ path: path.resolve(__dirname, ".env") });

/** Production site loaded in the Android WebView when `CAPACITOR_SERVER_URL` is unset. */
const DEFAULT_SERVER_URL = "https://marketplace-app-woad.vercel.app";

/**
 * Android shell loads your Next.js deployment (or dev server) in a WebView.
 * Override in `.env.local`: `CAPACITOR_SERVER_URL=...` (e.g. `http://10.0.2.2:3010` for emulator + local dev).
 */
const url =
  (process.env.CAPACITOR_SERVER_URL ?? "").trim() || DEFAULT_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.next.marketplace",
  appName: "Next",
  webDir: "www",
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
    },
  },
};

config.server = {
  url,
  cleartext: url.startsWith("http://"),
  androidScheme: url.startsWith("https") ? "https" : "http",
};

export default config;
