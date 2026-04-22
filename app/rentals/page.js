"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { useFirebaseAuthUser } from "../../hooks/useFirebaseAuthUser";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { descriptionWordCount } from "../../lib/descriptionWords";
import { db } from "../../lib/firebase";
import { notifyPostCreated } from "../../lib/notifications";
import { validateSellerEmailForPost } from "../../lib/sellerIdentity";
import { uploadItemImageBatch } from "../../lib/itemImageUpload";
import { MAX_ITEM_IMAGES, getItemPrimaryImageUrl, imageFieldsForFirestore } from "../../lib/itemImages";

/** Firestore collection id stays `properties` so existing listings keep working. */
const RENTALS_COLLECTION = "properties";

export default function RentalsPage() {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failedImagesById, setFailedImagesById] = useState({});

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [location, setLocation] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [contact, setContact] = useState("");
  const authUser = useFirebaseAuthUser();
  const fbBoot = useFirebaseBootstrapVersion();

  const loadRentals = useCallback(async () => {
    try {
      if (!db) {
        setRentals([]);
        return;
      }
      const snapshot = await getDocs(collection(db, RENTALS_COLLECTION));
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setRentals(data);
    } catch {
      setRentals([]);
    } finally {
      setLoading(false);
    }
  }, [fbBoot]);

  useEffect(() => {
    loadRentals();
  }, [loadRentals]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rentals;
    return rentals.filter((p) => {
      const n = String(p.name ?? "").toLowerCase();
      const loc = String(p.location ?? "").toLowerCase();
      return n.includes(q) || loc.includes(q);
    });
  }, [rentals, searchQuery]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!db) return;
    const emailCheck = validateSellerEmailForPost(authUser);
    if (!emailCheck.ok) {
      alert(emailCheck.message);
      return;
    }
    const postEmail = emailCheck.email;
    setSaving(true);
    try {
      const n = price === "" ? null : Number(price);
      const img = imageFieldsForFirestore(imageUrls.length ? imageUrls : [imageUrl]);
      await addDoc(collection(db, RENTALS_COLLECTION), {
        name: name.trim(),
        price: n === null || Number.isNaN(n) ? 0 : n,
        description: description.trim(),
        imageUrl: img.imageUrl,
        imageUrls: img.imageUrls,
        location: location.trim(),
        sellerName: sellerName.trim(),
        email: postEmail,
        contact: contact.trim(),
        createdAt: new Date(),
      });
      await notifyPostCreated(postEmail);
      setName("");
      setPrice("");
      setDescription("");
      setImageUrl("");
      setImageUrls([]);
      setLocation("");
      setSellerName("");
      setContact("");
      setShowForm(false);
      await loadRentals();
    } catch {
      alert("Could not save rental listing.");
    } finally {
      setSaving(false);
    }
  }

  async function onRentalImageChange(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const room = MAX_ITEM_IMAGES - imageUrls.length;
    if (room <= 0) {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images.`);
      e.target.value = "";
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > batch.length) {
      alert(`Only the first ${batch.length} file(s) were added (max ${MAX_ITEM_IMAGES}).`);
    }
    setImageUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(batch);
      setImageUrls((prev) => [...prev, ...uploaded].filter(Boolean));
      const primary = uploaded[0] || imageUrls[0] || "";
      if (primary) setImageUrl(primary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "Upload failed.");
      alert(msg);
    } finally {
      setImageUploading(false);
      e.target.value = "";
    }
  }

  function removeRentalImageAt(index) {
    setImageUrls((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setImageUrl("");
      return next;
    });
  }

  return (
    <main className="app-shell">
      <h1 className="app-title">Rentals</h1>

      <p className="mt-2 text-sm text-neutral-600">
        Looking for something specific?{" "}
        <Link href="/requests" className="font-semibold text-emerald-700 underline">
          Post a request
        </Link>
        .
      </p>

      <label className="sr-only" htmlFor="rentals-search">
        Search rentals
      </label>
      <div className="relative mt-4">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-neutral-400"
          aria-hidden
        >
          🔍
        </span>
        <input
          id="rentals-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search rentals…"
          autoComplete="off"
          className="app-search"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-center text-base font-bold text-white shadow-sm transition hover:bg-emerald-700"
      >
        Post rental
      </button>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <label className="app-label">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Listing title"
              className="app-input"
              required
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
              rows={4}
              placeholder="5 or more words"
              className="app-input min-h-[6rem]"
            />
            {description.trim().length > 0 &&
            descriptionWordCount(description) < 5 ? (
              <span className="text-xs text-neutral-500">
                Please enter at least 5 words
              </span>
            ) : null}
          </label>
          <label className="app-label mt-1">
            Image URL (optional if you uploaded photos)
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder={
                imageUrls.length
                  ? "Set automatically after upload — remove photos to type a link"
                  : "Paste a link here, or upload photos above"
              }
              className="app-input"
              readOnly={Boolean(imageUrls.length)}
            />
          </label>
          {imageUrls.length ? (
            <p className="text-xs text-neutral-500">
              Remove all uploaded photos above to paste a URL instead.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <span className="app-label mb-0 text-base">Upload photos</span>
            <p className="text-xs text-neutral-600">
              Select pictures from this device (max {MAX_ITEM_IMAGES}). They are uploaded to cloud
              storage; the Image URL field updates when done.
            </p>
            <input
              id="rental-photo-upload"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={onRentalImageChange}
              disabled={imageUploading || imageUrls.length >= MAX_ITEM_IMAGES}
              className="app-input w-full py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-60"
              aria-label="Choose images from device storage"
            />
            <label
              htmlFor="rental-photo-upload"
              className={`flex w-full cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-sm transition ${
                imageUploading || imageUrls.length >= MAX_ITEM_IMAGES
                  ? "cursor-not-allowed bg-neutral-300 text-neutral-600 opacity-80"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {imageUploading
                ? "Uploading…"
                : imageUrls.length > 0
                  ? "Add more photos (tap here)"
                  : "Tap to choose photos"}
            </label>
            <span className="text-xs text-neutral-500">
              {imageUploading
                ? "Uploading…"
                : `Selected: ${imageUrls.length}/${MAX_ITEM_IMAGES} image${imageUrls.length === 1 ? "" : "s"}.`}
            </span>
            {imageUrls.length ? (
              <div className="grid grid-cols-3 gap-2">
                {imageUrls.map((u, i) => (
                  <div
                    key={`${u}-${i}`}
                    className="relative overflow-hidden rounded-xl border border-gray-200 bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeRentalImageAt(i)}
                      className="absolute right-1 top-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white hover:bg-black/70"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <label className="app-label">
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Area"
              className="app-input"
            />
          </label>
          <label className="app-label">
            Seller name
            <input
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              placeholder="Enter your name"
              className="app-input"
            />
          </label>
          <label className="app-label">
            Contact
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="app-input"
            />
          </label>
          <button
            type="submit"
            disabled={saving || imageUploading}
            className="app-btn-primary disabled:opacity-60"
          >
            {saving ? "Saving…" : "Submit"}
          </button>
        </form>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="app-empty">Loading…</p>
        ) : rentals.length === 0 ? (
          <p className="app-empty">No rentals yet</p>
        ) : filtered.length === 0 ? (
          <p className="app-empty">No matching rentals.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => {
              const primaryUrl = getItemPrimaryImageUrl(p);
              const hasImage = Boolean(primaryUrl && String(primaryUrl).trim());
              const failed = Boolean(failedImagesById[p.id]);

              return (
                <Link
                  key={p.id}
                  href={`/rentals/${p.id}`}
                  className="app-card-link block overflow-hidden border border-gray-200 bg-white shadow-sm no-underline text-inherit"
                >
                  <div className="h-[120px] w-full overflow-hidden bg-gray-100">
                    {!hasImage ? (
                      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                        No Image
                      </div>
                    ) : failed ? (
                      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                        Image failed
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={primaryUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() =>
                          setFailedImagesById((prev) => ({
                            ...prev,
                            [p.id]: true,
                          }))
                        }
                      />
                    )}
                  </div>
                  <div className="app-card-body">
                    <div className="app-card-title line-clamp-2">{p.name}</div>
                    <div className="app-card-meta">{p.price}</div>
                    <div className="app-card-meta line-clamp-2">{p.location}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
