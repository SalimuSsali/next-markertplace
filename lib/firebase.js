import { initializeApp, getApps, getApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { devError, misconfigWarnOnce } from "./devLog";

// Firebase config from env (matches Firebase Console → Project settings → Your apps → Web)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();
if (measurementId) {
  firebaseConfig.measurementId = measurementId;
}

// Validate config
function hasRequiredWebConfig(cfg) {
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

const configured = hasRequiredWebConfig(firebaseConfig);

if (!configured) {
  misconfigWarnOnce(
    "firebase-web-config",
    "[firebase] Missing NEXT_PUBLIC_FIREBASE_* env vars. Auth/DB disabled."
  );
}

/** One Firebase app per browser context (getApp if already initialized). */
export const app = configured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

// Auth
export const auth = (() => {
  if (!app) return null;
  // WebView/Capacitor can be sensitive to storage partitioning. Prefer persistent storage.
  // If Auth was already initialized (or we're on server), fall back to getAuth().
  try {
    if (typeof window === "undefined") return getAuth(app);
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    return getAuth(app);
  }
})();

// Firestore (simple + stable)
export const db = (() => {
  if (!app) return null;
  try {
    return getFirestore(app);
  } catch (e) {
    devError("[firebase] Firestore init failed", e);
    return null;
  }
})();