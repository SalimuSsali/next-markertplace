/**
 * Optional Firebase Admin (server-only). Used by /api/messages/* when
 * `FIREBASE_SERVICE_ACCOUNT_JSON` is set (full service account JSON, one line on Vercel).
 */
import admin from "firebase-admin";

/**
 * @returns {import("firebase-admin").app.App | null}
 */
export function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const cred = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(cred),
    });
    return admin.app();
  } catch {
    return null;
  }
}

/**
 * @param {import("next/server").NextRequest} req
 * @returns {Promise<{ uid: string, email?: string, email_verified?: boolean } | null>}
 */
export async function verifyBearerIdToken(req) {
  const app = getAdminApp();
  if (!app) return null;
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified === true,
    };
  } catch {
    return null;
  }
}

export function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return admin.firestore();
}
