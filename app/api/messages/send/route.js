import { FieldValue } from "firebase-admin/firestore";
import { conversationDocId } from "../../../../lib/conversationId.js";
import { getAdminDb, verifyBearerIdToken } from "../../../../lib/firebaseAdmin.js";
import { resolveItemSellerUidAdmin } from "../../../../lib/server/resolveItemSellerUid.js";

export const runtime = "nodejs";

/**
 * POST /api/messages/send
 * Body: { text: string, conversationId?: string, itemId?: string, sellerId?: string }
 * - New thread: itemId + sellerId (must match item owner) + text; buyer = Bearer uid.
 * - Existing: conversationId + text
 * Requires Authorization: Bearer <Firebase ID token>
 */
export async function POST(req) {
  const db = getAdminDb();
  if (!db) {
    return Response.json(
      {
        error: {
          code: "MESSAGING_SERVER_DISABLED",
          message:
            "Set FIREBASE_SERVICE_ACCOUNT_JSON in the server environment, or use in-app Firestore (default).",
        },
      },
      { status: 503 },
    );
  }
  const user = await verifyBearerIdToken(req);
  if (!user) {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
  if (!user.email_verified) {
    return Response.json(
      { error: { message: "Verify your email to send messages." } },
      { status: 403 },
    );
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }
  const text = String(body.text ?? "").trim();
  if (!text || text.length > 2000) {
    return Response.json(
      { error: { message: "Message must be 1–2000 characters." } },
      { status: 400 },
    );
  }
  const conversationIdIn = String(body.conversationId ?? "").trim();
  const itemId = String(body.itemId ?? "").trim();
  const sellerIdIn = String(body.sellerId ?? "").trim();

  let conversationId = conversationIdIn;

  if (!conversationId) {
    if (!itemId || !sellerIdIn) {
      return Response.json(
        { error: { message: "Provide conversationId or itemId and sellerId." } },
        { status: 400 },
      );
    }
    const trueSeller = await resolveItemSellerUidAdmin(db, itemId);
    if (!trueSeller) {
      return Response.json({ error: { message: "Listing not found." } }, { status: 404 });
    }
    if (trueSeller !== sellerIdIn) {
      return Response.json({ error: { message: "Invalid seller for this listing." } }, { status: 400 });
    }
    if (user.uid === trueSeller) {
      return Response.json(
        { error: { message: "Use your seller inbox for this item." } },
        { status: 400 },
      );
    }
    const buyerId = user.uid;
    conversationId = conversationDocId(itemId, buyerId, trueSeller);
    const cRef = db.doc(`conversations/${conversationId}`);
    const cSnap = await cRef.get();
    if (!cSnap.exists) {
      await cRef.set({
        itemId,
        buyerId,
        sellerId: trueSeller,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } else {
    const cRef = db.doc(`conversations/${conversationId}`);
    const cSnap = await cRef.get();
    if (!cSnap.exists) {
      return Response.json({ error: { message: "Conversation not found." } }, { status: 404 });
    }
    const d = cSnap.data();
    if (d?.buyerId !== user.uid && d?.sellerId !== user.uid) {
      return Response.json({ error: { message: "Forbidden." } }, { status: 403 });
    }
  }
  await db.collection(`conversations/${conversationId}/messages`).add({
    senderId: user.uid,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ ok: true, conversationId });
}
