"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
} from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { ensureUserDoc } from "../../lib/ensureUserDoc";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { formatFirebaseAuthError } from "../../lib/firebaseAuthErrors";
import { PASSWORD_RULES_HINT, validatePasswordForSignup } from "../../lib/passwordRules";
import {
  isValidEmailFormat,
  setSellerSignupMode,
  SELLER_SIGNUP_MODE,
} from "../../lib/sellerIdentity";

export default function SignupPage() {
  const router = useRouter();
  const fbBoot = useFirebaseBootstrapVersion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/account");
    });
    return () => unsub();
  }, [fbBoot, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!auth) {
      setError("Auth is not configured. Try again in a moment.");
      return;
    }
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    const pwCheck = validatePasswordForSignup(password);
    if (!pwCheck.ok) {
      setError(pwCheck.message);
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords do not match. Re-enter both password fields.");
      return;
    }

    setBusy(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        await sendEmailVerification(
          res.user,
          origin ? { url: `${origin}/account`, handleCodeInApp: false } : undefined,
        );
      } catch (verr) {
        console.warn("[auth] sendEmailVerification failed", verr);
      }
      await ensureUserDoc(db, res?.user || null);
      setSellerSignupMode(SELLER_SIGNUP_MODE.EMAIL);
      setPassword("");
      setPasswordConfirm("");
      setSuccess(
        `Account created. We sent a verification link to ${cleanEmail}. Check your inbox (and spam).`,
      );
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Create account</h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-neutral-600">
          Sign up with your email and a password. We&apos;ll send a verification link to
          confirm the address.
        </p>

        {error ? (
          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50/90 p-3 text-xs text-red-900">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-900">
            {success}
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
              autoComplete="new-password"
              placeholder="Choose a password"
              className="app-input"
              required
            />
          </label>
          <label className="app-label mb-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span>Confirm password</span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                onClick={() => setShowPasswordConfirm((v) => !v)}
              >
                {showPasswordConfirm ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPasswordConfirm ? "text" : "password"}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Same password again"
              className="app-input"
              required
            />
          </label>
          <p className="text-xs text-neutral-500">{PASSWORD_RULES_HINT}</p>
          <button
            type="submit"
            disabled={busy}
            className="app-btn-primary disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-neutral-700">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-blue-700 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
