"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { formatFirebaseAuthError } from "../../lib/firebaseAuthErrors";

export default function ProfilePage() {
  const fbBoot = useFirebaseBootstrapVersion();
  const [authUser, setAuthUser] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
    });
    return () => unsub();
  }, [fbBoot]);

  async function handleSignOut() {
    if (!auth) return;
    setBusy(true);
    try {
      await signOut(auth);
    } catch (err) {
      alert(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Profile</h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">Guest &amp; account</p>
        <p className="mt-1 text-sm text-neutral-600">
          Browse without signing in. To post, create an account (or sign in) with your{" "}
          <strong>email &amp; password</strong>.
        </p>

        {!auth ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-950">
            <p className="font-semibold">Auth is not configured in this build</p>
            <p className="mt-1">
              Firebase Web SDK never started. Verify{" "}
              <code className="font-mono text-[11px]">NEXT_PUBLIC_FIREBASE_*</code> env
              vars in <code className="font-mono text-[11px]">.env.local</code> and on
              Vercel.
            </p>
          </div>
        ) : authUser ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-neutral-700">
                Signed in as{" "}
                <span className="font-semibold text-neutral-900">{authUser.email}</span>
                {authUser.emailVerified ? (
                  <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Verified
                  </span>
                ) : (
                  <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    Not verified
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-gray-50 disabled:opacity-60 sm:self-auto"
              >
                Sign out
              </button>
            </div>
            <Link
              href="/account"
              className="app-btn-primary text-center no-underline"
            >
              Account settings
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/login"
              className="app-btn-primary text-center no-underline"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="app-mode-btn text-center no-underline"
            >
              Create account
            </Link>
            <Link
              href="/forgot-password"
              className="self-start text-sm font-semibold text-blue-700 underline decoration-blue-700/50 hover:text-blue-800"
            >
              Forgot password?
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-neutral-900">Ratings &amp; Reviews</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Open any item to read reviews and submit your own (name + star rating + optional
          comment).
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link href="/items" className="app-btn-primary no-underline">
          Browse Items
        </Link>
        <Link href="/add" className="app-mode-btn text-center no-underline">
          Post an Ad
        </Link>
      </div>
    </main>
  );
}
