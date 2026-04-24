"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";
import { useFirebaseBootstrapVersion } from "../hooks/useFirebaseBootstrapVersion";
import { ensureConversation, sendConversationMessage } from "../lib/conversations";
import { db } from "../lib/firebase";
import { devError } from "../lib/devLog";

const INTEREST_SUGGESTIONS = [
  "Is this still available?",
  "I'm interested in this item.",
  "Could you share more details?",
];

function messageTime(m) {
  const v = m.createdAt;
  if (v?.toDate) return v.toDate().toLocaleString();
  if (v instanceof Date) return v.toLocaleString();
  return "";
}

/**
 * In-app chat between signed-in buyer and listing owner (`sellerUserId`).
 * Sellers can open existing threads for this item from the same block.
 * @param {{ itemId: string, sellerUserId: string | null, sellerDisplayName?: string | null, whatsappHref?: string | null }} props
 */
export default function ItemSellerChat({
  itemId,
  sellerUserId,
  sellerDisplayName = null,
  whatsappHref = null,
}) {
  const authUser = useFirebaseAuthUser();
  const uid = authUser?.uid ?? null;
  const fbBoot = useFirebaseBootstrapVersion();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sellerThreads, setSellerThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  /** Buyer: first message before the thread is opened (interest / intro). */
  const [interestText, setInterestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const isSeller = Boolean(uid && sellerUserId && uid === sellerUserId);

  useEffect(() => {
    if (!db || !itemId || !sellerUserId || !isSeller) {
      setSellerThreads([]);
      return;
    }
    const q = query(
      collection(db, "conversations"),
      where("itemId", "==", itemId),
      where("sellerId", "==", sellerUserId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSellerThreads(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        );
      },
      (err) => {
        devError("ItemSellerChat sellerThreads", err);
      },
    );
    return () => unsub();
  }, [db, itemId, sellerUserId, isSeller, fbBoot]);

  useEffect(() => {
    if (!db || !conversationId || !open) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        );
      },
      (err) => {
        devError("ItemSellerChat messages", err);
        setError("Could not load messages.");
      },
    );
    return () => unsub();
  }, [conversationId, open, db, fbBoot]);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    setInterestText("");
    setDraft("");
  }, [itemId]);

  const sendFirstMessageToSeller = useCallback(async () => {
    const text = interestText.trim();
    setError(null);
    if (!text) {
      setError("Write a short message so the seller knows you are interested.");
      return;
    }
    if (!db) {
      setError("Database is not available.");
      return;
    }
    if (!uid) {
      alert("Sign in to message the seller.");
      return;
    }
    if (!sellerUserId) {
      setError("Chat unavailable: seller not found");
      return;
    }
    if (uid === sellerUserId) {
      return;
    }
    setBusy(true);
    try {
      const cid = await ensureConversation(db, {
        itemId,
        buyerId: uid,
        sellerId: sellerUserId,
      });
      await sendConversationMessage(db, cid, uid, text);
      setConversationId(cid);
      setOpen(true);
      setInterestText("");
    } catch (err) {
      devError("ItemSellerChat sendFirstMessage", err);
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg === "Chat unavailable: seller not found"
          ? "Chat unavailable: seller not found"
          : "Could not send your message. Check your connection and Firestore rules.",
      );
    } finally {
      setBusy(false);
    }
  }, [db, itemId, interestText, sellerUserId, uid, fbBoot]);

  function openSellerThread(threadDocId) {
    setError(null);
    setConversationId(threadDocId);
    setOpen(true);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!db || !conversationId || !uid) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await sendConversationMessage(db, conversationId, uid, text);
      setDraft("");
    } catch (err) {
      devError("ItemSellerChat send", err);
      setError("Message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  if (!sellerUserId) {
    const hasWa = Boolean(whatsappHref);
    return (
      <section
        id="seller-chat"
        className="mb-6 scroll-mt-24 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900"
        role="region"
        aria-labelledby={`item-chat-unavailable-${itemId}`}
      >
        <h2
          id={`item-chat-unavailable-${itemId}`}
          className="mb-1 text-base font-bold text-amber-950"
        >
          In-app chat unavailable
        </h2>
        <p className="mb-2 leading-relaxed">
          This listing is not linked to a seller account we can use for messages (missing{" "}
          <span className="font-mono text-xs">userId</span> on the post, or the seller used a
          different sign-in). If you posted this, open this page while signed in with the same
          account as when you created the item so we can connect your profile.
        </p>
        {hasWa ? (
          <p className="mb-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline"
            >
              Open WhatsApp
            </a>{" "}
            if the seller left a number on this listing.
          </p>
        ) : (
          <p className="text-amber-800/90">
            Sellers can add a WhatsApp number when posting so buyers can reach them from this
            page.
          </p>
        )}
      </section>
    );
  }

  const chatPanel = open && conversationId ? (
    <div className="mt-2 flex flex-col gap-2">
      <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-100 bg-neutral-50 px-2 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="px-1 py-2 text-neutral-500">No messages yet. Say hello.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.senderId === uid;
              const who =
                mine ? "You" : m.senderId === sellerUserId ? "Seller" : "Buyer";
              return (
                <li
                  key={m.id}
                  className={`flex flex-col rounded-lg px-2 py-1.5 ${
                    mine
                      ? "ml-6 bg-blue-600 text-white"
                      : "mr-6 bg-white text-neutral-900 ring-1 ring-gray-200"
                  }`}
                >
                  <span className="text-[10px] opacity-80">
                    {who}{" "}
                    <span className="tabular-nums">{messageTime(m)}</span>
                  </span>
                  <span className="whitespace-pre-wrap break-words">{m.text}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSend} className="flex gap-2">
        <label className="sr-only" htmlFor={`item-chat-${itemId}`}>
          Message
        </label>
        <input
          id={`item-chat-${itemId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setConversationId(null);
        }}
        className="text-xs font-semibold text-neutral-600 underline"
      >
        Close chat
      </button>
    </div>
  ) : null;

  return (
    <section
      id="seller-chat"
      className="mb-6 scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-1 text-base font-bold text-neutral-900">Chat with seller</h2>
      {sellerDisplayName ? (
        <p className="mb-2 text-sm text-neutral-500">
          {isSeller ? "You are the seller" : `Listing by ${sellerDisplayName}`}
        </p>
      ) : null}
      {!uid ? (
        <p className="text-sm text-neutral-600">Sign in to message the seller.</p>
      ) : isSeller ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            When a buyer messages you about this item, open the thread here.
          </p>
          {sellerThreads.length === 0 ? (
            <p className="text-xs text-neutral-500">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sellerThreads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openSellerThread(t.id)}
                    className="w-full rounded-lg border border-gray-200 bg-neutral-50 px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100"
                  >
                    Buyer <span className="font-mono text-xs">{String(t.buyerId).slice(0, 8)}…</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chatPanel}
        </div>
      ) : (
        <>
          {!open ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-neutral-600">
                Tell the seller you are interested, ask a question, or suggest a time to meet. They
                will see your message in their chat for this listing.
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick message ideas">
                {INTEREST_SUGGESTIONS.map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() =>
                      setInterestText((prev) => {
                        const p = prev.trim();
                        return p ? `${p} ${line}` : line;
                      })
                    }
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-left text-xs font-medium text-blue-900 shadow-sm hover:bg-blue-100"
                  >
                    {line}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`item-interest-${itemId}`}
                  className="text-sm font-semibold text-neutral-800"
                >
                  Your message to the seller
                </label>
                <textarea
                  id={`item-interest-${itemId}`}
                  value={interestText}
                  onChange={(e) => setInterestText(e.target.value)}
                  placeholder="e.g. I’m interested. Is the price negotiable?"
                  rows={4}
                  maxLength={2000}
                  disabled={busy || !db}
                  className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="text-xs text-neutral-500">
                  {interestText.length.toLocaleString()} / 2,000
                </p>
              </div>
              {error ? (
                <p className="text-sm font-medium text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={sendFirstMessageToSeller}
                disabled={busy || !db || !interestText.trim()}
                className="app-btn-primary min-h-[48px] disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send message to seller"}
              </button>
            </div>
          ) : null}
          {chatPanel}
        </>
      )}
    </section>
  );
}
