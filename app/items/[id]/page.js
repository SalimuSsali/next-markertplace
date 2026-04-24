"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import ItemSellerChat from "../../../components/ItemSellerChat";
import ItemReviewsSection from "../../../components/ItemReviewsSection";
import { ItemExpiryWarning } from "../../../components/ExpiryWarning";
import { ItemExpiryCountdown } from "../../../components/ItemExpiryCountdown";
import { useFirebaseAuthUser } from "../../../hooks/useFirebaseAuthUser";
import { useFirebaseBootstrapVersion } from "../../../hooks/useFirebaseBootstrapVersion";
import {
  getItemStoredWhatsappDigits,
  getItemWhatsappHref,
} from "../../../lib/whatsappItem";
import { isExpired, isExpiringSoon } from "../../../lib/expiry";
import {
  getItemSellerUserId,
  getItemSellerUserIdForViewer,
  nextItemExpiresAfterRenewClient,
  renewItem,
} from "../../../lib/itemLifecycle";
import { getItemImageUrls } from "../../../lib/itemImages";
import { getItemTagList, getItemTitle } from "../../../lib/itemFields";
import { getItemLocationSearchText } from "../../../lib/itemLocation";
import { devError } from "../../../lib/devLog";
import { db } from "../../../lib/firebase";
import { getFirestoreDocIdFromParams } from "../../../lib/routeParams";
export default function ItemDetailPage() {
  const params = useParams();
  const id = getFirestoreDocIdFromParams(params, "id");
  const router = useRouter();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renewing, setRenewing] = useState(false);
  /** When the item has `shopId` but no `userId`, the shop doc may still carry the owner uid. */
  const [sellerUidFromShop, setSellerUidFromShop] = useState(null);
  const authUser = useFirebaseAuthUser();
  const currentUserEmail = authUser?.email ?? null;
  const fbBoot = useFirebaseBootstrapVersion();

  useEffect(() => {
    const fetchItem = async () => {
      try {
        if (!db || !id) {
          setItem(null);
          return;
        }

        const snap = await getDoc(doc(db, "items", id));
        if (!snap.exists()) {
          setItem(null);
          return;
        }

        const data = { id: snap.id, ...snap.data() };
        const now = new Date();
        if (isExpired(data.expiresAt, now)) {
          setItem(null);
          return;
        }
        setItem(data);
      } catch (err) {
        devError("ItemDetailPage fetch", err);
        setItem(null);
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [id, fbBoot]);

  /** Legacy items without `userId`: backfill from the verified owner (matches Firestore rules). */
  useEffect(() => {
    if (!db || !id || !item) return;
    if (getItemSellerUserId(item)) return;
    const eAuth = String(authUser?.email ?? "").trim().toLowerCase();
    const eItem = String(item?.email ?? "").trim().toLowerCase();
    if (!eAuth || !eItem || eAuth !== eItem || !authUser?.uid) return;
    if (authUser.emailVerified !== true) return;
    let cancelled = false;
    (async () => {
      try {
        await updateDoc(doc(db, "items", id), { userId: authUser.uid });
        if (!cancelled) {
          setItem((prev) => (prev ? { ...prev, userId: authUser.uid } : null));
        }
      } catch (err) {
        devError("ItemDetailPage backfill userId", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id, item, authUser, fbBoot]);

  useEffect(() => {
    if (!db || !item) {
      setSellerUidFromShop(null);
      return;
    }
    if (getItemSellerUserId(item)) {
      setSellerUidFromShop(null);
      return;
    }
    const shopId = String(item.shopId ?? "").trim();
    if (!shopId) {
      setSellerUidFromShop(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shops", shopId));
        if (cancelled || !snap.exists()) return;
        const u = snap.data()?.userId;
        const uid = u != null ? String(u).trim() : "";
        setSellerUidFromShop(uid || null);
      } catch (err) {
        devError("ItemDetailPage fetch shop for seller", err);
        if (!cancelled) setSellerUidFromShop(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, item, fbBoot]);

  const sellerUserIdForChat =
    getItemSellerUserIdForViewer(item, authUser) || sellerUidFromShop;

  const imageUrls = useMemo(() => getItemImageUrls(item), [item]);

  useEffect(() => {
    setActiveImageIndex(0);
    setImageFailed(false);
  }, [id, item?.id, imageUrls.join("|")]);

  async function handleRenew() {
    if (!db || !id || !item) return;
    setRenewing(true);
    try {
      await renewItem(db, id);
      const next = nextItemExpiresAfterRenewClient();
      setItem((prev) =>
        prev ? { ...prev, expiresAt: next, status: "active" } : prev,
      );
    } catch (err) {
      alert("Could not renew post.");
    } finally {
      setRenewing(false);
    }
  }

  async function handleDelete() {
    if (!db || !id) return;
    const sellerId = getItemSellerUserId(item);
    if (sellerId) {
      if (authUser?.uid !== sellerId) {
        alert("You can only delete your own listing.");
        return;
      }
    } else {
      const u = String(currentUserEmail ?? "").trim().toLowerCase();
      const listing = String(item?.email ?? "").trim().toLowerCase();
      if (u && listing && listing !== u) {
        alert("You can only delete your own listing.");
        return;
      }
    }
    if (!confirm("Are you sure you want to delete this?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "items", id));
      router.push("/items");
    } catch (err) {
      alert("Could not delete item.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <p className="text-neutral-600">Loading…</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="app-shell">
        <p className="app-empty">Item not found. Submit request.</p>
      </main>
    );
  }

  const whatsappHref = getItemWhatsappHref(item);
  const whatsappFieldDisplay = getItemStoredWhatsappDigits(item);

  const showExpiryWarning = isExpiringSoon(item.expiresAt);
  const tagList = getItemTagList(item);

  return (
    <main className="app-shell">
      <h1 className="app-title mb-4">{getItemTitle(item)}</h1>

      <div className="mb-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
        <ItemExpiryCountdown expiresAt={item.expiresAt} />
      </div>

      {showExpiryWarning ? (
        <div className="mb-4 rounded-xl ring-2 ring-amber-400/90">
          <ItemExpiryWarning onRenew={handleRenew} busy={renewing} />
        </div>
      ) : null}

      <div className="mb-5">
        <div className="h-[200px] w-full overflow-hidden rounded-xl bg-neutral-100 sm:h-[220px]">
          {imageUrls.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
              No Image
            </div>
          ) : imageFailed ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
              Image failed to load
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrls[activeImageIndex] ?? imageUrls[0]}
              alt="item"
              className="h-full w-full object-contain sm:object-cover"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>
        {imageUrls.length > 1 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {imageUrls.map((url, idx) => (
              <button
                key={`${url}-${idx}`}
                type="button"
                onClick={() => {
                  setActiveImageIndex(idx);
                  setImageFailed(false);
                }}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-neutral-100 ${
                  idx === activeImageIndex
                    ? "border-blue-600 ring-1 ring-blue-600"
                    : "border-transparent opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="app-fields mb-6">
        {tagList.length > 0 ? (
          <p>
            <strong className="font-semibold text-neutral-900">Tags:</strong>{" "}
            {tagList.join(", ")}
          </p>
        ) : null}
        <p>
          <strong className="font-semibold text-neutral-900">Price:</strong>{" "}
          {item.price}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">
            Description:
          </strong>{" "}
          {item.description}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Images:</strong>{" "}
          {imageUrls.length === 0
            ? "None"
            : `${imageUrls.length} photo${imageUrls.length === 1 ? "" : "s"}`}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Location:</strong>{" "}
          {getItemLocationSearchText(item) || "—"}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Seller Name:</strong>{" "}
          {item.sellerName}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Contact:</strong>{" "}
          {item.contact}
        </p>
        {whatsappFieldDisplay ? (
          <p>
            <strong className="font-semibold text-neutral-900">
              WhatsApp Number:
            </strong>{" "}
            <span className="font-mono tabular-nums">{whatsappFieldDisplay}</span>
          </p>
        ) : null}
        <p>
          <strong className="font-semibold text-neutral-900">Email:</strong>{" "}
          {item.email}
        </p>
      </div>

      <ItemSellerChat
        itemId={id}
        sellerUserId={sellerUserIdForChat}
        sellerDisplayName={item.sellerName ? String(item.sellerName) : null}
        whatsappHref={whatsappHref}
      />

      <ItemReviewsSection itemId={id} />

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="app-btn-primary inline-flex items-center justify-center"
          >
            Chat on WhatsApp
          </a>
        ) : (
          <p className="app-hint text-sm">
            Add a WhatsApp number when posting (optional) to open WhatsApp from this
            listing.
          </p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete Item"}
        </button>
      </div>
    </main>
  );
}
