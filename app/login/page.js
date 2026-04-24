"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { ensureUserDoc } from "../../lib/ensureUserDoc";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { formatFirebaseAuthError } from "../../lib/firebaseAuthErrors";
import {
  isValidEmailFormat,
  setSellerSignupMode,
  SELLER_SIGNUP_MODE,
} from "../../lib/sellerIdentity";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";
  const fbBoot = useFirebaseBootstrapVersion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace(next);
    });
    return () => unsub();
  }, [fbBoot, router, next]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!auth) {
      setError("Auth is not configured. Try again in a moment.");
      return;
    }
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
      await ensureUserDoc(db, res?.user || null);
      setSellerSignupMode(SELLER_SIGNUP_MODE.EMAIL);
      router.replace(next);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Sign in</h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {error ? (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50/90 p-3 text-xs text-red-900">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label className="app-label mb-0">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="app-input"
              required
            />
          </label>
          <label className="app-label mb-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span>Password</span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Your password"
              className="app-input"
              required
            />
          </label>

          <div className="flex items-center justify-between text-sm">
            <Link
              href="/forgot-password"
              className="font-semibold text-blue-700 underline decoration-blue-700/50 hover:text-blue-800"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="app-btn-primary disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-neutral-700">
          No account yet?{" "}
          <Link href="/signup" className="font-semibold text-blue-700 underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <h1 className="app-title">Sign in</h1>
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
