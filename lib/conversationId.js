/** Separator for deterministic conversation document IDs (must match Firestore rules + ItemSellerChat). */
export const CONV_ID_SEP = "__";

/**
 * `listingId` (item) + `buyerId` + `sellerId` — unique thread per pair per listing.
 * @param {string} listingId
 * @param {string} buyerId
 * @param {string} sellerId
 */
export function conversationDocId(listingId, buyerId, sellerId) {
  return `${String(listingId)}${CONV_ID_SEP}${String(buyerId)}${CONV_ID_SEP}${String(sellerId)}`;
}
