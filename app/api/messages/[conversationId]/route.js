import { getAdminDb, verifyBearerIdToken } from "../../../../lib/firebaseAdmin.js";

export const runtime = "nodejs";

/**
 * @param {import("firebase-admin/firestore").QueryDocumentSnapshot} doc
 */
function serializeMessage(doc) {
  const d = doc.data();
  const createdAt = d.createdAt;
  let createdAtMs = null;
  if (createdAt && typeof createdAt.toMillis === "function") {
    createdAtMs = createdAt.toMillis();
  } else if (createdAt && typeof createdAt._seconds === "number") {
    createdAtMs = createdAt._seconds * 1000;
  }
  return {
    id: doc.id,
    senderId: d.senderId,
    text: d.text,
    createdAt: createdAtMs,
  };
}

/**
 * GET /api/messages/:conversationId
 * Query messages (order preserved). Polling client should pass Authorization: Bearer <idToken>.
 */
export async function GET(req, context) {
  const db = getAdminDb();
  if (!db) {
    return Response.json(
      { error: { code: "MESSAGING_SERVER_DISABLED" } },
      { status: 503 },
    );
  }
  const user = await verifyBearerIdToken(req);
  if (!user) {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
  const params = await context.params;
  const conversationId = params?.conversationId;
  if (!conversationId || typeof conversationId !== "string") {
    return Response.json({ error: { message: "Missing conversation id." } }, { status: 400 });
  }
  const cSnap = await db.doc(`conversations/${conversationId}`).get();
  if (!cSnap.exists) {
    return Response.json({ error: { message: "Not found." } }, { status: 404 });
  }
  const d = cSnap.data();
  if (d?.buyerId !== user.uid && d?.sellerId !== user.uid) {
    return Response.json({ error: { message: "Forbidden." } }, { status: 403 });
  }
  const q = await db
    .collection(`conversations/${conversationId}/messages`)
    .orderBy("createdAt", "asc")
    .get();
  return Response.json({ messages: q.docs.map(serializeMessage) });
}
