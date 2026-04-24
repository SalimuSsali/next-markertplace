/**
 * Seller posting identity: all sign-in is email + password (Firebase).
 * Mode is kept in localStorage for back-compat; posting requires a signed-in user.
 * Guests can browse without signing in.
 */

const MODE_KEY = "marketplace_seller_signup_mode";

export const SELLER_SIGNUP_MODE = {
  EMAIL: "email",
  /** @deprecated Google sign-in was removed; kept only so old localStorage values don't break. */
  ACCOUNT: "account",
};

export function isValidEmailFormat(value) {
  const email = String(value ?? "").trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getSellerSignupMode() {
  if (typeof window === "undefined") return null;
  const m = localStorage.getItem(MODE_KEY);
  if (m === SELLER_SIGNUP_MODE.EMAIL || m === SELLER_SIGNUP_MODE.ACCOUNT) {
    return m;
  }
  return null;
}

export function setSellerSignupMode(mode) {
  if (typeof window === "undefined") return;
  if (
    mode === SELLER_SIGNUP_MODE.EMAIL ||
    mode === SELLER_SIGNUP_MODE.ACCOUNT
  ) {
    localStorage.setItem(MODE_KEY, mode);
  }
}

const NOT_SIGNED_IN_MESSAGE =
  "You must sign in to post. On Profile, create an account or sign in with your email and password.";

const NOT_VERIFIED_MESSAGE =
  "Verify your email before posting. Open the link we emailed you, then try again. You can resend the verification link from Account.";

/**
 * Full posting gate: signed-in + has an email + email is verified.
 * @param {import("firebase/auth").User | { email?: string | null, emailVerified?: boolean, uid?: string } | null} authUser
 * @returns {{ ok: true, email: string } | { ok: false, message: string }}
 */
export function validateSellerEmailForPost(authUser) {
  if (!authUser?.uid) {
    return { ok: false, message: NOT_SIGNED_IN_MESSAGE };
  }
  const email = String(authUser.email ?? "").trim();
  if (!email) {
    return {
      ok: false,
      message: "Your account must have an email address before you can post.",
    };
  }
  if (authUser.emailVerified !== true) {
    return { ok: false, message: NOT_VERIFIED_MESSAGE };
  }
  return { ok: true, email };
}

/**
 * Marketplace **items** (including shop inventory): signed-in + verified user with an email.
 * @param {import("firebase/auth").User | null} authUser
 * @returns {{ ok: true, email: string } | { ok: false, message: string }}
 */
export function validateUserForItemPost(authUser) {
  return validateSellerEmailForPost(authUser);
}

/** @deprecated Renamed to `validateUserForItemPost`. */
export const validateGoogleUserForItemPost = validateUserForItemPost;
