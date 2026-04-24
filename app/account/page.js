"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { formatFirebaseAuthError } from "../../lib/firebaseAuthErrors";
import { PASSWORD_RULES_HINT, validatePasswordForSignup } from "../../lib/passwordRules";
import { isValidEmailFormat } from "../../lib/sellerIdentity";

export default function AccountPage() {
  const router = useRouter();
  const fbBoot = useFirebaseBootstrapVersion();

  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [settingsTab, setSettingsTab] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNewConfirm, setPwNewConfirm] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwNewConfirm, setShowPwNewConfirm] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newEmailPw, setNewEmailPw] = useState("");
  const [showNewEmailPw, setShowNewEmailPw] = useState(false);

  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
      if (!u) router.replace("/login?next=/account");
    });
    return () => unsub();
  }, [fbBoot, router]);

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  async function reauth(currentPassword) {
    if (!auth?.currentUser?.email) {
      throw Object.assign(new Error("Not signed in."), {
        code: "auth/no-current-user",
      });
    }
    const cred = EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPassword,
    );
    await reauthenticateWithCredential(auth.currentUser, cred);
  }

  async function handleSignOut() {
    if (!auth) return;
    setBusy(true);
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    if (!auth?.currentUser) return;
    setVerifyBusy(true);
    setVerifyNotice(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await sendEmailVerification(
        auth.currentUser,
        origin ? { url: `${origin}/account`, handleCodeInApp: false } : undefined,
      );
      setVerifyNotice(
        `Verification link sent to ${auth.currentUser.email}. Check your inbox (and spam).`,
      );
    } catch (err) {
      setVerifyNotice(formatFirebaseAuthError(err));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    resetFeedback();
    if (!auth?.currentUser) return;
    if (!pwCurrent) {
      setError("Enter your current password.");
      return;
    }
    const rules = validatePasswordForSignup(pwNew);
    if (!rules.ok) {
      setError(rules.message);
      return;
    }
    if (pwNew !== pwNewConfirm) {
      setError("New passwords do not match.");
      return;
    }
    if (pwNew === pwCurrent) {
      setError("New password must differ from your current password.");
      return;
    }
    setBusy(true);
    try {
      await reauth(pwCurrent);
      await updatePassword(auth.currentUser, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwNewConfirm("");
      setMessage("Password updated. Use the new password next time you sign in.");
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault();
    resetFeedback();
    if (!auth?.currentUser) return;
    const nextEmail = newEmail.trim();
    if (!isValidEmailFormat(nextEmail)) {
      setError("Enter a valid new email address.");
      return;
    }
    if (
      auth.currentUser.email &&
      nextEmail.toLowerCase() === auth.currentUser.email.toLowerCase()
    ) {
      setError("That is already your current email.");
      return;
    }
    if (!newEmailPw) {
      setError("Enter your current password to confirm.");
      return;
    }
    setBusy(true);
    try {
      await reauth(newEmailPw);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await verifyBeforeUpdateEmail(
        auth.currentUser,
        nextEmail,
        origin ? { url: `${origin}/account`, handleCodeInApp: false } : undefined,
      );
      setNewEmail("");
      setNewEmailPw("");
      setMessage(
        `Verification link sent to ${nextEmail}. Open it to finish switching. Your current email stays active until you confirm.`,
      );
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main className="app-shell">
        <h1 className="app-title">Account</h1>
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  if (!authUser) {
    return null;
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Account</h1>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

        {!authUser.emailVerified ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-950">
            <p className="font-semibold">Verify your email</p>
            <p className="mt-1">
              Open the verification link we sent to{" "}
              <span className="font-mono">{authUser.email}</span> to confirm your
              account. Didn&apos;t get it?
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={verifyBusy}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {verifyBusy ? "Sending…" : "Resend verification email"}
            </button>
            {verifyNotice ? (
              <p className="mt-2 rounded bg-white px-2 py-1 text-[11px] text-amber-900">
                {verifyNotice}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-neutral-900">Account settings</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              resetFeedback();
              setSettingsTab(settingsTab === "password" ? null : "password");
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              settingsTab === "password"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-neutral-800"
            }`}
          >
            Change password
          </button>
          <button
            type="button"
            onClick={() => {
              resetFeedback();
              setSettingsTab(settingsTab === "email" ? null : "email");
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              settingsTab === "email"
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-neutral-800"
            }`}
          >
            Change email
          </button>
        </div>

        {message ? (
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50/90 p-2 text-xs text-emerald-900">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50/90 p-2 text-xs text-red-900">
            {error}
          </p>
        ) : null}

        {settingsTab === "password" ? (
          <form onSubmit={handleChangePassword} className="mt-3 flex flex-col gap-2">
            <label className="app-label mb-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>Current password</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  onClick={() => setShowPwCurrent((v) => !v)}
                >
                  {showPwCurrent ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPwCurrent ? "text" : "password"}
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                autoComplete="current-password"
                className="app-input"
              />
            </label>
            <label className="app-label mb-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>New password</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  onClick={() => setShowPwNew((v) => !v)}
                >
                  {showPwNew ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPwNew ? "text" : "password"}
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                autoComplete="new-password"
                className="app-input"
              />
            </label>
            <label className="app-label mb-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>Confirm new password</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  onClick={() => setShowPwNewConfirm((v) => !v)}
                >
                  {showPwNewConfirm ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPwNewConfirm ? "text" : "password"}
                value={pwNewConfirm}
                onChange={(e) => setPwNewConfirm(e.target.value)}
                autoComplete="new-password"
                className="app-input"
              />
            </label>
            <p className="text-xs text-neutral-500">{PASSWORD_RULES_HINT}</p>
            <button
              type="submit"
              disabled={busy}
              className="app-btn-primary disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        ) : null}

        {settingsTab === "email" ? (
          <form onSubmit={handleChangeEmail} className="mt-3 flex flex-col gap-2">
            <label className="app-label mb-0">
              New email
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                placeholder="new@example.com"
                className="app-input"
              />
            </label>
            <label className="app-label mb-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>Current password</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  onClick={() => setShowNewEmailPw((v) => !v)}
                >
                  {showNewEmailPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showNewEmailPw ? "text" : "password"}
                value={newEmailPw}
                onChange={(e) => setNewEmailPw(e.target.value)}
                autoComplete="current-password"
                className="app-input"
              />
            </label>
            <p className="text-xs text-neutral-500">
              We&apos;ll send a verification link to the new address. Your current email
              stays active until you open that link.
            </p>
            <button
              type="submit"
              disabled={busy}
              className="app-btn-primary disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send verification link"}
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Link href="/profile" className="app-mode-btn text-center no-underline">
          Back to Profile
        </Link>
      </div>
    </main>
  );
}
