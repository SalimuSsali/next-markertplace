"use client";

import Link from "next/link";
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
import { auth, db } from "../lib/firebase";
import { devError } from "../lib/devLog";

const INTEREST_SUGGESTIONS = [
  "Is this still available?",
  "I'm interested in this item.",
  "Could you share more details?",
];

const POLL_MS = 4000;

function useMessagesApi() {
  return process.env.NEXT_PUBLIC_MESSAGES_API === "1";
}

/** @param {unknown} m */
function messageTime(m) {
  if (!m || typeof m !== "object") return "";
  const v = "createdAt" in m ? m.createdAt : null;
  if (typeof v === "number" && !Number.isNaN(v)) {
    return new Date(v).toLocaleString();
  }
  if (v && typeof v.toDate === "function") return v.toDate().toLocaleString();
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === "string") return v;
  return "";
}

async function getIdToken() {
  const u = auth?.currentUser;
  if (!u) return null;
  return u.getIdToken();
}

/**
 * In-app chat: buyer ↔ seller for one listing. Optional HTTP API (polling) when
 * NEXT_PUBLIC_MESSAGES_API=1 and FIREBASE_SERVICE_ACCOUNT_JSON is set; otherwise Firestore client.
 * @param {{ itemId: string, sellerUserId: string | null, sellerDisplayName?: string | null, whatsappHref?: string | null, showMiniAppDock?: boolean }} props
 */
export default function ItemSellerChat({
  itemId,
  sellerUserId,
  sellerDisplayName = null,
  whatsappHref = null,
  /** Fixed launcher above the bottom tab bar on narrow screens (Capacitor / PWA “mini app”). */
  showMiniAppDock = true,
}) {
  const preferMessagesApi = useMessagesApi();
  const authUser = useFirebaseAuthUser();
  const uid = authUser?.uid ?? null;
  const fbBoot = useFirebaseBootstrapVersion();
  const [modalOpen, setModalOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sellerThreads, setSellerThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [interestText, setInterestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const isSeller = Boolean(uid && sellerUserId && uid === sellerUserId);

  // ---- Seller: list threads for this item (Firestore) ----
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

  // ---- Firestore: live messages (when not using HTTP API) ----
  useEffect(() => {
    if (preferMessagesApi) return;
    if (!db || !conversationId || !modalOpen) {
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
  }, [conversationId, modalOpen, db, fbBoot, preferMessagesApi]);

  // ---- API: poll messages ----
  const loadMessagesFromApi = useCallback(async () => {
    if (!conversationId || !modalOpen) return;
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch(
        `/api/messages/${encodeURIComponent(conversationId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 503) {
        setError("Messaging API not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON or set NEXT_PUBLIC_MESSAGES_API=0 for Firestore-only.");
        return;
      }
      if (!res.ok) {
        setError("Could not load messages.");
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data.messages) ? data.messages : [];
      setMessages(
        list.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          text: m.text,
          createdAt: m.createdAt,
        })),
      );
      setError(null);
    } catch (e) {
      devError("ItemSellerChat poll", e);
    }
  }, [conversationId, modalOpen]);

  useEffect(() => {
    if (!preferMessagesApi || !conversationId || !modalOpen) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    loadMessagesFromApi();
    pollRef.current = setInterval(loadMessagesFromApi, POLL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [preferMessagesApi, conversationId, modalOpen, loadMessagesFromApi]);

  useEffect(() => {
    if (modalOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, modalOpen]);

  useEffect(() => {
    setInterestText("");
    setDraft("");
    setConversationId(null);
    setModalOpen(false);
  }, [itemId]);

  const sendFirstMessageToSeller = useCallback(async () => {
    const text = interestText.trim();
    setError(null);
    if (!text) {
      setError("Write a short message so the seller knows you are interested.");
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
    if (uid === sellerUserId) return;
    if (!db && !preferMessagesApi) {
      setError("Database is not available.");
      return;
    }
    setBusy(true);
    try {
      if (preferMessagesApi) {
        const token = await getIdToken();
        if (!token) {
          setError("Sign in again to send a message.");
          return;
        }
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            itemId,
            sellerId: sellerUserId,
            text,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.error?.message) {
          setError(data.error.message);
          return;
        }
        if (!res.ok) {
          if (res.status === 503) {
            setError("Server messaging not configured. Use Firestore: set NEXT_PUBLIC_MESSAGES_API=0 in .env.local.");
          } else {
            setError(data.error?.message || "Could not send your message.");
          }
          return;
        }
        const cid = data.conversationId;
        if (cid) setConversationId(cid);
        setInterestText("");
        return;
      }
      const cid = await ensureConversation(db, {
        itemId,
        buyerId: uid,
        sellerId: sellerUserId,
      });
      await sendConversationMessage(db, cid, uid, text);
      setConversationId(cid);
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
  }, [db, itemId, interestText, sellerUserId, uid, preferMessagesApi, fbBoot]);

  function openThread(threadDocId) {
    setError(null);
    setConversationId(threadDocId);
    setModalOpen(true);
  }

  function scrollToInlineChat() {
    document.getElementById("seller-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const handleSend = useCallback(
    async (e) => {
      e.preventDefault();
      if (!conversationId || !uid) return;
      const text = draft.trim();
      if (!text) return;
      setBusy(true);
      setError(null);
      try {
        if (preferMessagesApi) {
          const token = await getIdToken();
          if (!token) return;
          const res = await fetch("/api/messages/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ conversationId, text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data.error?.message || "Message could not be sent.");
            return;
          }
          setDraft("");
          await loadMessagesFromApi();
          return;
        }
        if (!db) return;
        await sendConversationMessage(db, conversationId, uid, text);
        setDraft("");
      } catch (err) {
        devError("ItemSellerChat send", err);
        setError("Message could not be sent.");
      } finally {
        setBusy(false);
      }
    },
    [db, conversationId, uid, draft, preferMessagesApi, loadMessagesFromApi],
  );

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

  const chatThread = (
    <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
      <div className="max-h-[min(50vh,22rem)] min-h-32 overflow-y-auto rounded-lg border border-gray-100 bg-neutral-50 px-2 py-2 text-sm">
        {messages.length === 0 ? (
          <p className="px-1 py-2 text-neutral-500">No messages yet. Say hello.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.senderId === uid;
              const who = mine
                ? "You"
                : m.senderId === sellerUserId
                  ? "Seller"
                  : "Buyer";
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
        <label className="sr-only" htmlFor={`item-chat-input-${itemId}`}>
          Message
        </label>
        <input
          id={`item-chat-input-${itemId}`}
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
    </div>
  );

  const firstMessageForm = !conversationId && !isSeller && (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
          disabled={busy || (!db && !preferMessagesApi)}
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="text-xs text-neutral-500">
          {interestText.length.toLocaleString()} / 2,000
        </p>
      </div>
      <button
        type="button"
        onClick={sendFirstMessageToSeller}
        disabled={busy || (!db && !preferMessagesApi) || !interestText.trim()}
        className="app-btn-primary min-h-[48px] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send message to seller"}
      </button>
    </div>
  );

  const modal = modalOpen && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`seller-chat-title-${itemId}`}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id={`seller-chat-title-${itemId}`} className="text-base font-bold text-neutral-900">
            Chat with seller
          </h2>
          <button
            type="button"
            onClick={() => {
              setModalOpen(false);
              if (!isSeller) setConversationId(null);
            }}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isSeller && conversationId ? (
            chatThread
          ) : isSeller && !conversationId ? (
            <p className="text-sm text-neutral-500">Select a conversation above.</p>
          ) : !isSeller && conversationId ? (
            chatThread
          ) : (
            firstMessageForm
          )}
        </div>
      </div>
    </div>
  );

  const miniAppChatDock =
    showMiniAppDock && sellerUserId && !modalOpen ? (
      <div
        className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
        style={{
          bottom: "max(4.25rem, calc(3.25rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <div className="pointer-events-auto mx-auto max-w-lg px-3">
          {!uid ? (
            <Link
              href="/login"
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-blue-200 bg-white text-center text-sm font-bold text-blue-800 shadow-lg shadow-black/10"
            >
              Sign in to chat with seller
            </Link>
          ) : isSeller ? (
            <button
              type="button"
              onClick={() => {
                scrollToInlineChat();
                if (sellerThreads.length === 1) {
                  openThread(sellerThreads[0].id);
                }
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 text-center text-sm font-bold text-violet-900 shadow-lg shadow-black/10"
            >
              <span aria-hidden>💬</span>
              Buyer messages
              {sellerThreads.length > 0 ? (
                <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                  {sellerThreads.length}
                </span>
              ) : (
                <span className="text-xs font-normal text-violet-700">(none yet)</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setModalOpen(true);
              }}
              className="app-btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl shadow-lg shadow-black/15"
            >
              <span aria-hidden>💬</span>
              Message seller
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
    <section
      id="seller-chat"
      className="mb-6 scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-1 text-base font-bold text-neutral-900">Chat with seller</h2>
      {sellerDisplayName ? (
        <p className="mb-2 text-sm text-neutral-500">
          {isSeller ? "You are the seller" : `Listing by ${sellerDisplayName}`}
        </p>
      ) : isSeller ? (
        <p className="mb-2 text-sm font-medium text-blue-800">You are the seller</p>
      ) : null}
      {preferMessagesApi ? (
        <p className="mb-2 text-xs text-neutral-500">
          Messages use the app API (polling). Requires{" "}
          <span className="font-mono">FIREBASE_SERVICE_ACCOUNT_JSON</span> on the server.
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
                    onClick={() => openThread(t.id)}
                    className="w-full rounded-lg border border-gray-200 bg-neutral-50 px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100"
                  >
                    Buyer{" "}
                    <span className="font-mono text-xs">
                      {String(t.buyerId).slice(0, 8)}…
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
            className="app-btn-primary min-h-[48px] w-full sm:w-auto"
          >
            Chat with seller
          </button>
        </div>
      )}
      {modal}
    </section>
    {miniAppChatDock}
    </>
  );
}
