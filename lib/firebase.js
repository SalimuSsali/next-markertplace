import { initializeApp, getApps, getApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import {
  hasRequiredWebConfig,
  readFirebaseWebConfigFromEnvironment,
} from "./firebaseBootstrap";
import { devError, misconfigWarnOnce } from "./devLog";

const FIREBASE_BOOTSTRAP = "firebase-bootstrap";

let firebaseConfig = readFirebaseWebConfigFromEnvironment();
let configured = hasRequiredWebConfig(firebaseConfig);

if (!configured) {
  misconfigWarnOnce(
    "firebase-web-config",
    "[firebase] Missing NEXT_PUBLIC_FIREBASE_* env vars. Auth/DB disabled until bootstrap.",
  );
}

/** Live bindings: may be filled after async `/api/firebase-web-config` on the client. */
export let app = null;
export let auth = null;
export let db = null;

let bootstrapped = false;

/** True once `auth`/`db` are usable. Cheap to call from hooks/components. */
export function isFirebaseBootstrapped() {
  return bootstrapped;
}

function applyFirebaseConfig(cfg) {
  if (!hasRequiredWebConfig(cfg)) return false;
  firebaseConfig = cfg;
  configured = true;
  try {
    app = getApps().length ? getApp() : initializeApp(cfg);
    try {
      if (typeof window === "undefined") {
        auth = getAuth(app);
      } else {
        auth = initializeAuth(app, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        });
      }
    } catch {
      auth = getAuth(app);
    }
    db = getFirestore(app);
    bootstrapped = true;
    return true;
  } catch (e) {
    devError("[firebase] init failed", e);
    app = null;
    auth = null;
    db = null;
    bootstrapped = false;
    return false;
  }
}

if (configured) {
  applyFirebaseConfig(firebaseConfig);
}

if (typeof window !== "undefined" && !bootstrapped) {
  const MAX_ATTEMPTS = 3;

  const dispatchBootstrap = () => {
    if (bootstrapped) {
      window.dispatchEvent(new Event(FIREBASE_BOOTSTRAP));
    }
  };

  const fetchConfig = (attempt) => {
    if (bootstrapped) return;
    fetch("/api/firebase-web-config", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} from /api/firebase-web-config`);
        return r.json();
      })
      .then((cfg) => {
        if (bootstrapped) return;
        if (applyFirebaseConfig(cfg)) {
          dispatchBootstrap();
          return;
        }
        console.warn(
          "[firebase] /api/firebase-web-config returned incomplete config. Auth/DB disabled. Check NEXT_PUBLIC_FIREBASE_* on the server that serves this deployment.",
        );
      })
      .catch((err) => {
        console.warn(
          `[firebase] bootstrap attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
          err?.message || err,
        );
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => fetchConfig(attempt + 1), 1500 * attempt);
        } else {
          console.error(
            "[firebase] giving up; Auth/DB remain disabled. Verify /api/firebase-web-config on this host and that the page is online.",
          );
        }
      });
  };

  queueMicrotask(() => {
    if (bootstrapped) return;
    const retryCfg = readFirebaseWebConfigFromEnvironment();
    if (hasRequiredWebConfig(retryCfg)) {
      applyFirebaseConfig(retryCfg);
      dispatchBootstrap();
      return;
    }
    fetchConfig(1);
  });
}

export const FIREBASE_BOOTSTRAP_EVENT = FIREBASE_BOOTSTRAP;
