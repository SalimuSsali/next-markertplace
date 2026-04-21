"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { ItemExpiryWarning, ShopExpiryWarning } from "../../../components/ExpiryWarning";
import { useFirebaseAuthUser } from "../../../hooks/useFirebaseAuthUser";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { isExpired, isExpiringSoon, newShopExpiresAt } from "../../../lib/expiry";
import {
  filterActiveItems,
  getUserTypeForUserId,
  newItemLifecycleFields,
  nextItemExpiresAfterRenewClient,
  renewItem,
} from "../../../lib/itemLifecycle";
import { devError } from "../../../lib/devLog";
import { descriptionWordCount } from "../../../lib/descriptionWords";
import { formatSubmitError } from "../../../lib/formatSubmitError";
import {
  SEARCH_DEBOUNCE_MS,
  buildGlobalSearchIndex,
  rankItemSearch,
} from "../../../lib/globalSearch";
import { getItemTitle, parseTagsInput } from "../../../lib/itemFields";
import {
  planItemImageFileBatch,
  uploadItemImageBatch,
} from "../../../lib/itemImageUpload";
import {
  imageFieldsForFirestore,
  MAX_ITEM_IMAGES,
  getItemImageUrls,
  getItemPrimaryImageUrl,
} from "../../../lib/itemImages";
import { db } from "../../../lib/firebase";
import { getFirestoreDocIdFromParams } from "../../../lib/routeParams";
import { defaultItemLocationForCreate } from "../../../lib/itemLocation";
import { validateGoogleUserForItemPost } from "../../../lib/sellerIdentity";
import { parseOptionalWhatsapp } from "../../../lib/whatsappItem";
import {
  notifyPostCreated,
  notifyShopExpiringSoonOncePerSession,
} from "../../../lib/notifications";

async function fetchShopItems(shopDocId) {
  if (!db || !shopDocId) return [];
  const itemsQuery = query(
    collection(db, "items"),
    where("shopId", "==", shopDocId)
  );
  const snap = await getDocs(itemsQuery);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export default function ShopDetailPage() {
  const params = useParams();
  const id = getFirestoreDocIdFromParams(params, "id");
  const router = useRouter();

  const [shop, setShop] = useState(null);
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [failedImagesById, setFailedImagesById] = useState({});
  const [showPostForm, setShowPostForm] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [deletingShop, setDeletingShop] = useState(false);
  const [renewingShop, setRenewingShop] = useState(false);
  const [renewingItemId, setRenewingItemId] = useState(null);
  const authUser = useFirebaseAuthUser();

  const [postTitle, setPostTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [postTagsInput, setPostTagsInput] = useState("");
  const [itemImageUrls, setItemImageUrls] = useState([]);
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [contact, setContact] = useState("");
  const [postWhatsapp, setPostWhatsapp] = useState("");

  const [shopCoverUrls, setShopCoverUrls] = useState([]);
  const [shopCoverUploading, setShopCoverUploading] = useState(false);
  const [savingShopPhotos, setSavingShopPhotos] = useState(false);

  const shopItemSearchIndex = useMemo(
    () => buildGlobalSearchIndex(shopItems),
    [shopItems],
  );
  const debouncedShopSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const debouncedShopTrim = debouncedShopSearch.trim();
  const rankedShopItems = useMemo(
    () =>
      rankItemSearch(shopItems, debouncedShopTrim, shopItemSearchIndex, {
        limit: 100,
      }),
    [shopItems, debouncedShopTrim, shopItemSearchIndex],
  );
  const filteredItems = debouncedShopTrim
    ? rankedShopItems.results.map((r) => r.item)
    : shopItems;

  useEffect(() => {
    if (shop) setShopCoverUrls(getItemImageUrls(shop));
  }, [shop]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!db || !id) {
        if (!cancelled) {
          setShop(null);
          setShopItems([]);
          setLoading(false);
        }
        return;
      }

      try {
        const shopSnap = await getDoc(doc(db, "shops", id));
        if (!shopSnap.exists()) {
          if (!cancelled) {
            setShop(null);
            setShopItems([]);
          }
          return;
        }

        const shopData = { id: shopSnap.id, ...shopSnap.data() };
        const now = new Date();
        if (isExpired(shopData.expiresAt, now)) {
          await deleteDoc(doc(db, "shops", id));
          if (!cancelled) {
            setShop(null);
            setShopItems([]);
          }
          return;
        }

        if (!cancelled) {
          setShop(shopData);
          if (isExpiringSoon(shopData.expiresAt, now) && shopData.email) {
            notifyShopExpiringSoonOncePerSession(shopData.id, shopData.email);
          }
        }

        let items = await fetchShopItems(id);
        items = filterActiveItems(items, now);
        if (!cancelled) setShopItems(items);
      } catch (err) {
        devError("ShopDetailPage load", err);
        if (!cancelled) {
          setShop(null);
          setShopItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handlePostItem(e) {
    e.preventDefault();
    if (!db || !id) return;
    if (!postTitle.trim()) {
      alert("Please enter a title.");
      return;
    }
    const googleCheck = validateGoogleUserForItemPost(authUser);
    if (!googleCheck.ok) {
      alert(googleCheck.message);
      return;
    }
    const postEmail = googleCheck.email;
    setPostSaving(true);
    try {
      const n = price === "" ? null : Number(price);
      const { imageUrl, imageUrls } = imageFieldsForFirestore(itemImageUrls);
      const tags = parseTagsInput(postTagsInput);
      const title = postTitle.trim();
      const waParsed = parseOptionalWhatsapp(postWhatsapp);
      if (!waParsed.ok) {
        alert(waParsed.error);
        return;
      }
      const userType = await getUserTypeForUserId(db, authUser.uid);
      await addDoc(collection(db, "items"), {
        title,
        name: title,
        price: n === null || Number.isNaN(n) ? 0 : n,
        description: description.trim(),
        tags,
        imageUrl,
        imageUrls,
        contact: contact.trim(),
        ...(waParsed.digits
          ? { whatsapp: waParsed.digits, contactPhone: waParsed.digits }
          : {}),
        email: postEmail,
        shopId: id,
        userId: authUser.uid,
        userType,
        ...defaultItemLocationForCreate(),
        ...newItemLifecycleFields(userType),
      });
      await notifyPostCreated(postEmail);
      setPostTitle("");
      setPrice("");
      setDescription("");
      setPostTagsInput("");
      setItemImageUrls([]);
      setContact("");
      setPostWhatsapp("");
      setShowPostForm(false);
      const items = await fetchShopItems(id);
      setShopItems(items);
    } catch (err) {
      alert("Could not save item.");
    } finally {
      setPostSaving(false);
    }
  }

  async function onShopItemImagesChange(e) {
    const plan = planItemImageFileBatch(e.target.files, itemImageUrls.length);
    if (plan.action === "none") return;
    if (plan.action === "full") {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images.`);
      e.target.value = "";
      return;
    }
    if (plan.truncated) {
      alert(
        `Only the first ${plan.batch.length} file(s) were added (max ${MAX_ITEM_IMAGES}).`,
      );
    }
    setPostImageUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(plan.batch);
      setItemImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setPostImageUploading(false);
      e.target.value = "";
    }
  }

  function removeShopItemImageAt(index) {
    setItemImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function onShopCoverImagesChange(e) {
    const plan = planItemImageFileBatch(e.target.files, shopCoverUrls.length);
    if (plan.action === "none") return;
    if (plan.action === "full") {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images.`);
      e.target.value = "";
      return;
    }
    if (plan.truncated) {
      alert(
        `Only the first ${plan.batch.length} file(s) were added (max ${MAX_ITEM_IMAGES}).`,
      );
    }
    setShopCoverUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(plan.batch);
      setShopCoverUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setShopCoverUploading(false);
      e.target.value = "";
    }
  }

  function removeShopCoverAt(index) {
    setShopCoverUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveShopPhotos() {
    if (!db || !id || !shop) return;
    const u = String(authUser?.email ?? "").trim().toLowerCase();
    const listing = String(shop?.email ?? "").trim().toLowerCase();
    if (!u || listing !== u) {
      alert("You can only update your own shop.");
      return;
    }
    setSavingShopPhotos(true);
    try {
      const fields = imageFieldsForFirestore(shopCoverUrls);
      await updateDoc(doc(db, "shops", id), fields);
      setShop((s) => (s ? { ...s, ...fields } : s));
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setSavingShopPhotos(false);
    }
  }

  async function handleDelete(item) {
    if (!db) return;
    const u = String(authUser?.email ?? "").trim().toLowerCase();
    const listing = String(item?.email ?? "").trim().toLowerCase();
    if (u && listing && listing !== u) {
      alert("You can only delete your own listing.");
      return;
    }
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      await deleteDoc(doc(db, "items", item.id));
      setShopItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      alert("Could not delete item.");
    }
  }

  async function handleRenewShop() {
    if (!db || !id) return;
    setRenewingShop(true);
    try {
      const next = newShopExpiresAt();
      await updateDoc(doc(db, "shops", id), { expiresAt: next });
      setShop((s) => (s ? { ...s, expiresAt: next } : s));
    } catch (err) {
      alert("Could not renew shop.");
    } finally {
      setRenewingShop(false);
    }
  }

  async function handleRenewShopItem(item) {
    if (!db || !item?.id) return;
    setRenewingItemId(item.id);
    try {
      await renewItem(db, item.id);
      const next = nextItemExpiresAfterRenewClient();
      setShopItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, expiresAt: next, status: "active" }
            : i,
        ),
      );
    } catch (err) {
      alert("Could not renew post.");
    } finally {
      setRenewingItemId(null);
    }
  }

  async function handleDeleteShop() {
    if (!db || !id) return;
    const u = String(authUser?.email ?? "").trim().toLowerCase();
    const listing = String(shop?.email ?? "").trim().toLowerCase();
    if (u && listing && listing !== u) {
      alert("You can only delete your own listing.");
      return;
    }
    if (!confirm("Are you sure you want to delete this?")) return;
    setDeletingShop(true);
    try {
      await deleteDoc(doc(db, "shops", id));
      router.push("/shops");
    } catch (err) {
      alert("Could not delete shop.");
    } finally {
      setDeletingShop(false);
    }
  }

  if (loading) {
    return (
      <main className="app-shell">
        <p className="text-neutral-600">Loading…</p>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="app-shell">
        <p className="app-empty">Shop not found.</p>
      </main>
    );
  }

  const phoneRaw =
    shop.phone != null && String(shop.phone).trim() !== ""
      ? String(shop.phone).trim().replace(/\s/g, "")
      : "";
  const telHref = phoneRaw ? `tel:${phoneRaw}` : null;

  const shopExpiringSoon = isExpiringSoon(shop.expiresAt);
  const isShopOwner =
    String(authUser?.email ?? "").trim().toLowerCase() ===
    String(shop?.email ?? "").trim().toLowerCase();

  return (
    <main className="app-shell">
      <h1 className="app-title mb-4">{shop.shopName}</h1>

      {shopCoverUrls.length > 0 ? (
        <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shopCoverUrls.map((url, idx) => (
            <li
              key={`${url}-${idx}`}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-neutral-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="aspect-square w-full object-cover"
                referrerPolicy="no-referrer"
              />
              {isShopOwner ? (
                <button
                  type="button"
                  onClick={() => removeShopCoverAt(idx)}
                  className="absolute right-1 top-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isShopOwner ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">Shop photos</p>
          <label className="app-label">
            Add images (up to {MAX_ITEM_IMAGES} total)
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={onShopCoverImagesChange}
              disabled={
                shopCoverUploading ||
                shopCoverUrls.length >= MAX_ITEM_IMAGES
              }
              className="app-input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 disabled:opacity-60"
            />
            {shopCoverUploading ? (
              <span className="mt-1 block text-xs text-neutral-500">
                Uploading…
              </span>
            ) : null}
          </label>
          <button
            type="button"
            onClick={handleSaveShopPhotos}
            disabled={savingShopPhotos}
            className="app-btn-primary max-w-xs disabled:opacity-60"
          >
            {savingShopPhotos ? "Saving…" : "Save photos to shop"}
          </button>
          <p className="text-xs text-neutral-500">
            Upload new files above, remove thumbnails if needed, then save.
          </p>
        </div>
      ) : null}

      {shopExpiringSoon ? (
        <div className="mb-4 rounded-xl ring-2 ring-rose-300/90">
          <ShopExpiryWarning
            onRenew={handleRenewShop}
            busy={renewingShop}
          />
        </div>
      ) : null}

      <div className="app-fields mb-6">
        <p>
          <strong className="font-semibold text-neutral-900">Owner Name:</strong>{" "}
          {shop.ownerName}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Email:</strong>{" "}
          {shop.email}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Phone:</strong>{" "}
          {shop.phone}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Location:</strong>{" "}
          {shop.location}
        </p>
        {Array.isArray(shop.tags) && shop.tags.length > 0 ? (
          <p>
            <strong className="font-semibold text-neutral-900">Tags:</strong>{" "}
            {shop.tags.join(", ")}
          </p>
        ) : null}
        <p>
          <strong className="font-semibold text-neutral-900">Description:</strong>{" "}
          {shop.description}
        </p>
        <p>
          <strong className="font-semibold text-neutral-900">Is Verified:</strong>{" "}
          {shop.isVerified ? "Yes" : "No"}
        </p>
      </div>

      <div className="mt-2">
        {telHref ? (
          <a href={telHref} className="app-btn-primary">
            Call Shop
          </a>
        ) : (
          <p className="app-hint">Add a phone number to call this shop.</p>
        )}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleDeleteShop}
          disabled={deletingShop}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
        >
          {deletingShop ? "Deleting…" : "Delete Shop"}
        </button>
      </div>

      <section className="mt-8 border-t border-gray-200 pt-6">
        <label className="sr-only" htmlFor="shop-items-search">
          Search shop items
        </label>
        <div className="relative mb-3">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-neutral-400"
            aria-hidden
          >
            🔍
          </span>
          <input
            id="shop-items-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shop items..."
            className="app-search"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPostForm((v) => !v)}
          className="app-btn-primary mb-4 shadow-md"
        >
          Post Item
        </button>

        {showPostForm ? (
          <form
            onSubmit={handlePostItem}
            className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <label className="app-label">
              Title
              <input
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="What are you selling?"
                className="app-input"
                required
              />
            </label>
            <label className="app-label">
              Tags / keywords
              <input
                value={postTagsInput}
                onChange={(e) => setPostTagsInput(e.target.value)}
                placeholder="Comma-separated"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Price
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="Amount"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="5 or more words"
                className="app-input min-h-[5rem]"
              />
              {description.trim().length > 0 &&
              descriptionWordCount(description) < 5 ? (
                <span className="text-xs text-neutral-500">
                  Please enter at least 5 words
                </span>
              ) : null}
            </label>
            <label className="app-label">
              Item photos (up to {MAX_ITEM_IMAGES})
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={onShopItemImagesChange}
                disabled={
                  postImageUploading || itemImageUrls.length >= MAX_ITEM_IMAGES
                }
                className="app-input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 disabled:opacity-60"
              />
              <span className="text-xs text-neutral-500">
                Select one or more images to upload
              </span>
              {postImageUploading ? (
                <span className="mt-1 block text-xs text-neutral-500">
                  Uploading…
                </span>
              ) : null}
            </label>
            {itemImageUrls.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {itemImageUrls.map((url, idx) => (
                  <li
                    key={`${url}-${idx}`}
                    className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="mx-auto aspect-square max-h-28 w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removeShopItemImageAt(idx)}
                      className="absolute right-1 top-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="app-label">
              Contact
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="app-input"
              />
            </label>
            <label className="app-label">
              WhatsApp Number (optional)
              <input
                value={postWhatsapp}
                onChange={(e) => setPostWhatsapp(e.target.value)}
                inputMode="tel"
                placeholder="+256 7… (international format)"
                autoComplete="tel"
                className="app-input"
              />
              <span className="text-xs text-neutral-500">
                Digits only (+ and spaces allowed while typing).
              </span>
            </label>
            <button
              type="submit"
              disabled={postSaving}
              className="app-btn-primary disabled:opacity-60"
            >
              {postSaving ? "Saving…" : "Submit"}
            </button>
          </form>
        ) : null}

        <h2 className="mb-3 text-base font-bold text-neutral-900">
          Shop Items
        </h2>

        {shopItems.length === 0 ? (
          <p className="text-sm text-neutral-500">No items in this shop</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-neutral-500">No matching items</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => {
              const thumbUrl = getItemPrimaryImageUrl(item);
              const hasImage = Boolean(thumbUrl);
              const failed = Boolean(failedImagesById[item.id]);
              const itemSoon = isExpiringSoon(item.expiresAt);

              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md ${
                    itemSoon ? "ring-2 ring-amber-400/80" : ""
                  }`}
                >
                  <Link href={`/items/${item.id}`} className="block no-underline">
                    <div className="h-[150px] w-full overflow-hidden bg-gray-100">
                      {!hasImage ? (
                        <div className="flex h-[150px] w-full items-center justify-center text-sm text-neutral-500">
                          No Image
                        </div>
                      ) : failed ? (
                        <div className="flex h-[150px] w-full items-center justify-center text-sm text-neutral-500">
                          Image failed to load
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrl}
                          alt="item"
                          className="h-[150px] w-full object-cover"
                          onError={() =>
                            setFailedImagesById((prev) => ({
                              ...prev,
                              [item.id]: true,
                            }))
                          }
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-neutral-900">
                        {getItemTitle(item)}
                      </p>
                      <p className="text-sm text-neutral-600">{item.price}</p>
                    </div>
                  </Link>
                  {itemSoon ? (
                    <div
                      className="border-t border-amber-200 bg-amber-50/95 px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ItemExpiryWarning
                        onRenew={() => handleRenewShopItem(item)}
                        busy={renewingItemId === item.id}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="w-full border-t border-neutral-100 px-3 py-2 text-sm font-medium text-red-600"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
