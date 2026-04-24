import {
  Timestamp,
  deleteField,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { MS_DAY, isExpired } from "./expiry";

/**
 * Tier-based marketplace **items** lifecycle (single source of truth).
 *
 * Rules:
 * - Read `users/{uid}.userType`: `"normal"` | `"shop"`. Missing/unknown → `"normal"`.
 * - Initial `expiresAt`: normal = 30 days, shop = 60 days from post time.
 * - Renew: +7 days from renewal time (both tiers); `status` stays `"active"`.
 * - New docs should include: `userId`, `userType` (recommended), `createdAt`, `expiresAt`, `status`.
 * - Scheduled function uses only `expiresAt` (warnings ≤3 days, then delete).
 *
 * Do not duplicate TTL math elsewhere; import from this module.
 */

export const USER_TYPE_NORMAL = "normal";
export const USER_TYPE_SHOP = "shop";

/** Initial listing duration for normal accounts (and fallback when `userType` is absent). */
export const ITEM_INITIAL_DAYS_NORMAL = 30;
/** Initial listing duration for `userType === "shop"`. */
export const ITEM_INITIAL_DAYS_SHOP = 60;
/** Days added on each successful renew (both tiers). */
export const ITEM_RENEW_ADD_DAYS = 7;

function normalizeUserType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === USER_TYPE_SHOP) return USER_TYPE_SHOP;
  return USER_TYPE_NORMAL;
}

const ITEM_INITIAL_ACTIVE_MS_NORMAL = ITEM_INITIAL_DAYS_NORMAL * MS_DAY;
const ITEM_INITIAL_ACTIVE_MS_SHOP = ITEM_INITIAL_DAYS_SHOP * MS_DAY;

const ITEM_RENEW_MS = ITEM_RENEW_ADD_DAYS * MS_DAY;

export const ITEM_STATUS_ACTIVE = "active";

/**
 * Reads `users/{uid}.userType` ("normal" | "shop").
 * Fallback: missing/unknown → "normal".
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} userId
 */
export async function getUserTypeForUserId(db, userId) {
  const uid = String(userId ?? "").trim();
  if (!db || !uid) return USER_TYPE_NORMAL;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return USER_TYPE_NORMAL;
    return normalizeUserType(snap.data()?.userType);
  } catch {
    return USER_TYPE_NORMAL;
  }
}

/**
 * Fields for a newly created item (`createdAt` / `expiresAt` as Firestore Timestamps).
 * Merge with listing payload; caller must set `userId`.
 * @param {"normal" | "shop" | string | null | undefined} userType
 */
export function newItemLifecycleFields(userType) {
  const now = Date.now();
  const tier = normalizeUserType(userType);
  // Same as: Date.now() + (tier === shop ? 60 : 30) * 24 * 60 * 60 * 1000
  const initialMs =
    tier === USER_TYPE_SHOP
      ? ITEM_INITIAL_ACTIVE_MS_SHOP
      : ITEM_INITIAL_ACTIVE_MS_NORMAL;
  return {
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + initialMs),
    status: ITEM_STATUS_ACTIVE,
  };
}

/** Patch applied on renew (clears server notify dedupe). */
export function renewItemFirestorePatch() {
  const now = Date.now();
  return {
    expiresAt: Timestamp.fromMillis(now + ITEM_RENEW_MS),
    status: ITEM_STATUS_ACTIVE,
    expireSoonLastNotifyDay: deleteField(),
  };
}

/** Client optimistic `expiresAt` after a successful renew. */
export function nextItemExpiresAfterRenewClient() {
  return Timestamp.fromMillis(Date.now() + ITEM_RENEW_MS);
}

/**
 * Renew a listing: +7 days, `status: active`, clears `expireSoonLastNotifyDay`.
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} itemId
 */
export async function renewItem(db, itemId) {
  if (!db || !itemId) {
    throw new Error("renewItem: db and itemId are required");
  }
  await updateDoc(doc(db, "items", itemId), renewItemFirestorePatch());
}

/**
 * Firebase Auth uid of the listing owner, or null if missing/legacy.
 * Tries `userId`, then `sellerId` / `ownerId` (older or imported docs).
 */
export function getItemSellerUserId(item) {
  const fields = [item?.userId, item?.sellerId, item?.ownerId];
  for (const raw of fields) {
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s.length > 0) return s;
  }
  return null;
}

/**
 * Like {@link getItemSellerUserId} but treats the signed-in viewer as the owner when
 * the document is missing `userId` and `item.email` matches the viewer (legacy listings).
 * Buyers still need a stored `userId` on the item (see item detail backfill) so the
 * seller id is a public fact on the document.
 * @param {object|null|undefined} item
 * @param {{ uid?: string | null, email?: string | null } | null|undefined} viewer
 */
export function getItemSellerUserIdForViewer(item, viewer) {
  const fromDoc = getItemSellerUserId(item);
  if (fromDoc) return fromDoc;
  const eV = String(viewer?.email ?? "").trim().toLowerCase();
  const eI = String(item?.email ?? "").trim().toLowerCase();
  const uid = String(viewer?.uid ?? "").trim();
  if (eV && eI && eV === eI && uid) return uid;
  return null;
}

/** Hide expired rows without deleting (deletion is Cloud Function only). */
export function filterActiveItems(rows, now = new Date()) {
  return (rows || []).filter((r) => !isExpired(r.expiresAt, now));
}
