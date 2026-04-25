/**
 * Resolve listing owner uid from an `items/{itemId}` doc (Admin Firestore).
 * Matches client `getItemSellerUserId` / shop resolution for chat security.
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {string} itemId
 * @returns {Promise<string | null>}
 */
export async function resolveItemSellerUidAdmin(db, itemId) {
  const id = String(itemId ?? "").trim();
  if (!id) return null;
  const snap = await db.doc(`items/${id}`).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  const u = d.userId != null ? String(d.userId).trim() : "";
  if (u) return u;
  const shopId = String(d.shopId ?? "").trim();
  if (!shopId) return null;
  const shop = await db.doc(`shops/${shopId}`).get();
  if (!shop.exists) return null;
  const su = shop.data()?.userId;
  return su != null && String(su).trim() ? String(su).trim() : null;
}
