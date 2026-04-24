"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { formatFirebaseAuthError } from "../../lib/firebaseAuthErrors";
import { isValidEmailFormat } from "../../lib/sellerIdentity";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (!auth) {
      setError("Auth is not configured. Try again in a moment.");
      return;
    }
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await sendPasswordResetEmail(
        auth,
        cleanEmail,
        origin ? { url: `${origin}/login`, handleCodeInApp: false } : undefined,
      );
      setSent(true);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Forgot password</h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-neutral-600">
          Enter your account email. We&apos;ll send a password-reset link.
        </p>

        {error ? (
          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50/90 p-3 text-xs text-red-900">
            {error}
          </div>
        ) : null}
        {sent ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-900">
            If an account exists for <span className="font-mono">{email}</span>, we sent a
            password-reset link. Open it from your inbox (check spam too).
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
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
          <button
            type="submit"
            disabled={busy}
            className="app-btn-primary disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-4 text-sm text-neutral-700">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-blue-700 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
