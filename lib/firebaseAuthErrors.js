/**
 * Turn Firebase Auth errors into something a developer or user can act on.
 * Self-contained (no imports) so builds never fail on a missing sibling module.
 */

/**
 * @returns {string}
 */
function authorizedDomainsTroubleshooting() {
  const hostname =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "";
  const lines = [
    "This domain is not authorized for Firebase Auth.",
    "",
    "Fix: Firebase Console → Authentication → Settings → Authorized domains → Add domain.",
    "Add the hostname from your address bar (e.g. localhost, 127.0.0.1, or marketplace-app-43621.vercel.app).",
    "Note: localhost and 127.0.0.1 are separate entries—add the one you actually use.",
  ];
  if (hostname) {
    lines.push("", `Your current hostname: ${hostname}`);
  }
  return lines.join("\n");
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function formatFirebaseAuthError(err) {
  const code = err && typeof err === "object" ? err.code : null;
  const msg =
    err && typeof err === "object" && typeof err.message === "string"
      ? err.message
      : "";

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID";
  const handlerUrl = `https://${projectId}.firebaseapp.com/__/auth/handler`;

  if (code === "auth/operation-not-allowed") {
    return "This sign-in method is off in Firebase. Open Authentication → Sign-in method and enable Email/Password and/or Google.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Open “Sign in” and enter your password, or use a different email to create an account.";
  }
  if (code === "auth/weak-password") {
    return "That password is too weak. Use at least 8 characters with at least one letter and one number.";
  }
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "Wrong password or email. Check both and try again.";
  }
  if (code === "auth/user-not-found") {
    return "No account for this email. Use “Create account” or check the spelling.";
  }
  if (code === "auth/invalid-email") {
    return "That email address is not valid.";
  }
  if (code === "auth/missing-password") {
    return "Enter your password.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return authorizedDomainsTroubleshooting();
  }
  if (code === "auth/popup-blocked") {
    return "The browser blocked the sign-in pop-up. Use “Sign in with Google (full page)” on Profile, or allow pop-ups for this site.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error while contacting Google/Firebase. Check your connection and try again.";
  }
  if (code === "auth/invalid-api-key") {
    return "Invalid Firebase API key. In Firebase Console → Project settings → Your apps, copy the apiKey into NEXT_PUBLIC_FIREBASE_API_KEY and restart the dev server.";
  }
  if (code === "auth/missing-initial-state") {
    return [
      "Google sign-in could not complete (“missing initial state”).",
      "",
      "This is common inside Android WebViews when storage/cookies are blocked or cleared during the redirect.",
      "",
      "Fix:",
      "1) Use Firebase → Authentication → Settings → Authorized domains → add your Vercel hostname.",
      "2) In Google Cloud Console OAuth client, add the same hostname under Authorized JavaScript origins.",
      "3) On Android: uninstall/reinstall the app to clear the WebView partition, then try again.",
      "4) If it still fails in the app, sign in from the normal phone browser once, then reopen the app.",
    ].join("\n");
  }

  if (
    /Unable to verify that the app domain is authorized/i.test(msg) ||
    /app domain is not authorized/i.test(msg)
  ) {
    return authorizedDomainsTroubleshooting();
  }

  if (
    code === "auth/internal-error" ||
    /invalid/i.test(msg) ||
    msg.includes("The requested action is invalid")
  ) {
    return [
      "Google sign-in failed (“The requested action is invalid” usually means OAuth setup, not your code).",
      "",
      "0) Console shows getProjectConfig 400 or “Unable to verify that the app domain is authorized”?",
      "   → Firebase → Authentication → Settings → Authorized domains → Add domain → use the hostname in your address bar (localhost, 127.0.0.1, or your preview host).",
      "",
      "1) Firebase → Authentication → Sign-in method → Google → ON. Save.",
      `2) Google Cloud Console → APIs & Services → Credentials → your Web client (OAuth 2.0). Under “Authorized redirect URIs”, add exactly: ${handlerUrl}`,
      "3) Under “Authorized JavaScript origins”, add your dev and production origins (e.g. http://localhost:3010 and https://…).",
      "4) Confirm .env.local matches the same Firebase project: NEXT_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID — then restart npm run dev.",
      "5) Use “Sign in with Google (full page)” if pop-ups cause issues.",
    ].join("\n");
  }

  if (msg && msg.length > 0 && msg.length < 500) return msg;
  return "Sign-in failed. Please try again.";
}
