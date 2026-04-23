"use client";

import { useEffect, useState } from "react";
import {
  FIREBASE_BOOTSTRAP_EVENT,
  isFirebaseBootstrapped,
} from "../lib/firebase";

/**
 * Increments when Firebase finishes async bootstrap (e.g. `/api/firebase-web-config`).
 * Use as a `useEffect` dependency so data loaders re-run once `db` / `auth` exist.
 * Safe against the race where bootstrap completes before this hook mounts:
 * we check `isFirebaseBootstrapped()` on mount and bump once if already ready.
 */
export function useFirebaseBootstrapVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const h = () => setV((n) => n + 1);
    window.addEventListener(FIREBASE_BOOTSTRAP_EVENT, h);
    if (isFirebaseBootstrapped()) {
      setV((n) => (n === 0 ? 1 : n));
    }
    return () => window.removeEventListener(FIREBASE_BOOTSTRAP_EVENT, h);
  }, []);
  return v;
}
