import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { USER_TYPE_NORMAL } from "./itemLifecycle";

/**
 * Ensure `users/{uid}` exists for the signed-in user.
 * - Does not overwrite existing userType (or other profile fields).
 * - Safe fallback: if Firestore is unavailable, resolves without throwing.
 *
 * @param {import("firebase/firestore").Firestore | null} db
 * @param {{ uid?: string | null, email?: string | null, displayName?: string | null } | null} user
 * @returns {Promise<{ ok: true, userType?: string } | { ok: false, error: string }>}
 */
export async function ensureUserDoc(db, user) {
  const uid = String(user?.uid ?? "").trim();
  const email = String(user?.email ?? "").trim();
  const name = String(user?.displayName ?? "").trim();

  if (!uid) {
    return { ok: false, error: "Missing user uid after sign-in." };
  }
  if (!db) {
    // Auth might still work even if Firestore isn't configured.
    return { ok: true };
  }

  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      return { ok: true, userType: typeof data.userType === "string" ? data.userType : undefined };
    }

    await setDoc(
      ref,
      {
        uid,
        userId: uid,
        email: email || null,
        name: name || null,
        userType: USER_TYPE_NORMAL,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: true, userType: USER_TYPE_NORMAL };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
    return { ok: false, error: msg };
  }
}

