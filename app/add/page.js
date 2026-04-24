"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useFirebaseAuthUser } from "../../hooks/useFirebaseAuthUser";
import { descriptionWordCount } from "../../lib/descriptionWords";
import { parseTagsInput } from "../../lib/itemFields";
import { formatSubmitError } from "../../lib/formatSubmitError";
import { db } from "../../lib/firebase";
import { newShopExpiresAt } from "../../lib/expiry";
import {
  getUserTypeForUserId,
  newItemLifecycleFields,
  USER_TYPE_SHOP,
} from "../../lib/itemLifecycle";
import {
  planItemImageFileBatch,
  uploadItemImageBatch,
} from "../../lib/itemImageUpload";
import { notifyPostCreated } from "../../lib/notifications";
import { imageFieldsForFirestore, MAX_ITEM_IMAGES } from "../../lib/itemImages";
import {
  validateUserForItemPost,
  validateSellerEmailForPost,
} from "../../lib/sellerIdentity";
import {
  buildStructuredLocationForFirestore,
  DEFAULT_ITEM_LOCATION,
} from "../../lib/itemLocation";
import { parseOptionalWhatsapp } from "../../lib/whatsappItem";
import { CategoryGrid } from "../../components/CategoryGrid";
import { applyCategoryToTags, DEFAULT_CATEGORY_ID } from "../../lib/categories";

function AddPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("item");
  const [saving, setSaving] = useState(false);

  // Post Item
  const [itemTitle, setItemTitle] = useState("");
  const [price, setPrice] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemTagsInput, setItemTagsInput] = useState("");
  const [itemImageUrls, setItemImageUrls] = useState([]);
  const [itemCategoryId, setItemCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [locCountry, setLocCountry] = useState(DEFAULT_ITEM_LOCATION.country);
  const [locDistrict, setLocDistrict] = useState(DEFAULT_ITEM_LOCATION.district);
  const [locTown, setLocTown] = useState(DEFAULT_ITEM_LOCATION.town);
  const [locVillage, setLocVillage] = useState(DEFAULT_ITEM_LOCATION.village);
  const [sellerName, setSellerName] = useState("");
  const [itemContact, setItemContact] = useState("");
  const [itemWhatsapp, setItemWhatsapp] = useState("");
  const [uploading, setUploading] = useState(false);

  // Post Request
  const [reqTitle, setReqTitle] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [reqLocation, setReqLocation] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [reqContact, setReqContact] = useState("");

  // Register Shop
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopLocation, setShopLocation] = useState("");
  const [shopTagsInput, setShopTagsInput] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [shopImageUrls, setShopImageUrls] = useState([]);
  const [shopImageUploading, setShopImageUploading] = useState(false);

  // Offer Service
  const [svcTitle, setSvcTitle] = useState("");
  const [svcDescription, setSvcDescription] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [providerName, setProviderName] = useState("");
  const [svcContact, setSvcContact] = useState("");
  const [svcLocation, setSvcLocation] = useState("");
  const [svcImageUrls, setSvcImageUrls] = useState([]);
  const [svcImageUploading, setSvcImageUploading] = useState(false);
  const authUser = useFirebaseAuthUser();

  useEffect(() => {
    const m = searchParams.get("mode");
    const t = searchParams.get("title");
    if (m === "request") setMode("request");
    if (t) setReqTitle(t);
  }, [searchParams]);

  async function onSubmit(e) {
    e.preventDefault();

    let postEmail = "";
    if (mode === "item") {
      const userCheck = validateUserForItemPost(authUser);
      if (!userCheck.ok) {
        alert(userCheck.message);
        return;
      }
      postEmail = userCheck.email;
    } else {
      const emailCheck = validateSellerEmailForPost(authUser);
      if (!emailCheck.ok) {
        alert(emailCheck.message);
        return;
      }
      postEmail = emailCheck.email;
    }
    if (!db) {
      alert(
        "Database is not configured. Add Firebase keys to .env.local and restart the dev server.",
      );
      return;
    }
    if (mode === "item" && !itemTitle.trim()) {
      alert("Please enter a title");
      return;
    }
    setSaving(true);
    try {
      if (mode === "item") {
        const n = price === "" ? null : Number(price);
        const { imageUrl, imageUrls } = imageFieldsForFirestore(itemImageUrls);
        const tags = applyCategoryToTags(parseTagsInput(itemTagsInput), itemCategoryId);
        const title = itemTitle.trim();
        const waParsed = parseOptionalWhatsapp(itemWhatsapp);
        if (!waParsed.ok) {
          alert(waParsed.error);
          return;
        }
        const sellerUid = authUser.uid;
        const userType = await getUserTypeForUserId(db, sellerUid);
        const itemData = {
          title,
          name: title,
          price: n === null || Number.isNaN(n) ? 0 : n,
          description: itemDescription.trim(),
          tags,
          imageUrl,
          imageUrls,
          ...buildStructuredLocationForFirestore({
            country: locCountry,
            district: locDistrict,
            town: locTown,
            village: locVillage,
          }),
          sellerName: sellerName.trim(),
          email: postEmail,
          contact: itemContact.trim(),
          ...(waParsed.digits
            ? { whatsapp: waParsed.digits, contactPhone: waParsed.digits }
            : {}),
          userId: sellerUid,
          userType,
          ...newItemLifecycleFields(userType),
        };
        await addDoc(collection(db, "items"), itemData);
        await notifyPostCreated(postEmail);
        alert("Posted successfully");
        router.push("/items");
        return;
      }

      if (mode === "request") {
        const b = budget === "" ? null : Number(budget);
        await addDoc(collection(db, "requests"), {
          title: reqTitle.trim(),
          description: reqDescription.trim(),
          budget: b === null || Number.isNaN(b) ? 0 : b,
          location: reqLocation.trim(),
          requesterName: requesterName.trim(),
          email: postEmail,
          contact: reqContact.trim(),
        });
        await notifyPostCreated(postEmail);
        alert("Posted successfully");
        router.push("/requests");
        return;
      }

      if (mode === "shop") {
        const shopTags = parseTagsInput(shopTagsInput);
        const { imageUrl, imageUrls } = imageFieldsForFirestore(shopImageUrls);
        await addDoc(collection(db, "shops"), {
          shopName: shopName.trim(),
          ownerName: ownerName.trim(),
          email: postEmail,
          phone: phone.trim(),
          location: shopLocation.trim(),
          tags: shopTags,
          description: shopDescription.trim(),
          imageUrl,
          imageUrls,
          userId: authUser?.uid ?? null,
          createdAt: new Date(),
          expiresAt: newShopExpiresAt(),
        });
        const shopOwnerUid = String(authUser?.uid ?? "").trim();
        if (shopOwnerUid) {
          await setDoc(
            doc(db, "users", shopOwnerUid),
            {
              uid: shopOwnerUid,
              userId: shopOwnerUid,
              email: postEmail,
              userType: USER_TYPE_SHOP,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        await notifyPostCreated(postEmail);
        alert("Posted successfully");
        router.push("/shops");
        return;
      }

      if (mode === "service") {
        const { imageUrl, imageUrls } = imageFieldsForFirestore(svcImageUrls);
        await addDoc(collection(db, "services"), {
          title: svcTitle.trim(),
          description: svcDescription.trim(),
          priceRange: priceRange.trim(),
          providerName: providerName.trim(),
          email: postEmail,
          contact: svcContact.trim(),
          location: svcLocation.trim(),
          imageUrl,
          imageUrls,
        });
        await notifyPostCreated(postEmail);
        alert("Posted successfully");
        router.push("/services");
      }
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onItemImagesChange(e) {
    const plan = planItemImageFileBatch(e.target.files, itemImageUrls.length);
    if (plan.action === "none") return;
    if (plan.action === "full") {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images. Remove one to add more.`);
      e.target.value = "";
      return;
    }
    if (plan.truncated) {
      alert(
        `Only the first ${plan.batch.length} file(s) were added (max ${MAX_ITEM_IMAGES} images).`,
      );
    }
    setUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(plan.batch);
      setItemImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onShopImagesChange(e) {
    const plan = planItemImageFileBatch(e.target.files, shopImageUrls.length);
    if (plan.action === "none") return;
    if (plan.action === "full") {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images. Remove one to add more.`);
      e.target.value = "";
      return;
    }
    if (plan.truncated) {
      alert(
        `Only the first ${plan.batch.length} file(s) were added (max ${MAX_ITEM_IMAGES} images).`,
      );
    }
    setShopImageUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(plan.batch);
      setShopImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setShopImageUploading(false);
      e.target.value = "";
    }
  }

  function removeShopImageAt(index) {
    setShopImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSvcImagesChange(e) {
    const plan = planItemImageFileBatch(e.target.files, svcImageUrls.length);
    if (plan.action === "none") return;
    if (plan.action === "full") {
      alert(`You can add up to ${MAX_ITEM_IMAGES} images. Remove one to add more.`);
      e.target.value = "";
      return;
    }
    if (plan.truncated) {
      alert(
        `Only the first ${plan.batch.length} file(s) were added (max ${MAX_ITEM_IMAGES} images).`,
      );
    }
    setSvcImageUploading(true);
    try {
      const uploaded = await uploadItemImageBatch(plan.batch);
      setSvcImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert(formatSubmitError(err));
    } finally {
      setSvcImageUploading(false);
      e.target.value = "";
    }
  }

  function removeSvcImageAt(index) {
    setSvcImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function removeItemImageAt(index) {
    setItemImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  const needsSignIn = !authUser;
  const needsVerification = !!authUser && !authUser.emailVerified;

  return (
    <main className="app-shell">
      <h1 className="app-title mb-5">Add</h1>

      {needsSignIn ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-900">
          <p className="font-semibold">Sign in required</p>
          <p className="mt-1">
            You must create an account (or sign in) with your email and password before you
            can post.
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href="/login?next=/add"
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white no-underline hover:bg-red-700"
            >
              Sign in
            </a>
            <a
              href="/signup"
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 no-underline hover:bg-red-100"
            >
              Create account
            </a>
          </div>
        </div>
      ) : null}

      {needsVerification ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
          <p className="font-semibold">Verify your email to post</p>
          <p className="mt-1">
            We sent a verification link to{" "}
            <span className="font-mono">{authUser.email}</span>. Open it to confirm your
            account, then refresh this page.
          </p>
          <a
            href="/account"
            className="mt-3 inline-block rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 no-underline hover:bg-amber-100"
          >
            Go to Account (resend link)
          </a>
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-2.5">
        <button
          type="button"
          className={`app-mode-btn ${mode === "item" ? "app-mode-btn-active" : ""}`}
          onClick={() => setMode("item")}
        >
          Post Item
        </button>
        <button
          type="button"
          className={`app-mode-btn ${mode === "request" ? "app-mode-btn-active" : ""}`}
          onClick={() => setMode("request")}
        >
          Post Request
        </button>
        <button
          type="button"
          className={`app-mode-btn ${mode === "shop" ? "app-mode-btn-active" : ""}`}
          onClick={() => setMode("shop")}
        >
          Register Shop
        </button>
        <button
          type="button"
          className={`app-mode-btn ${mode === "service" ? "app-mode-btn-active" : ""}`}
          onClick={() => setMode("service")}
        >
          Offer Service
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "item" && (
          <>
            <label className="app-label">
              Title
              <input
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                placeholder="What are you selling?"
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
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                rows={4}
                placeholder="5 or more words"
                className="app-input min-h-[6rem]"
              />
              {itemDescription.trim().length > 0 &&
              descriptionWordCount(itemDescription) < 5 ? (
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
                onChange={onItemImagesChange}
                disabled={uploading || itemImageUrls.length >= MAX_ITEM_IMAGES}
                className="app-input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 disabled:opacity-60"
              />
              <span className="text-xs text-neutral-500">
                Select one or more images — they upload and appear below
              </span>
              {uploading ? (
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
                      className="mx-auto aspect-square max-h-36 w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemImageAt(idx)}
                      className="absolute right-1 top-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <CategoryGrid
                selectedId={itemCategoryId}
                onSelect={setItemCategoryId}
                columns={2}
                size="md"
                label="Category"
                helpText="Optional — if you skip, it stays in Food & All Items."
              />
            </div>

            <fieldset className="rounded-xl border border-gray-200 bg-neutral-50/80 p-3">
              <legend className="px-1 text-sm font-semibold text-neutral-800">
                Location
              </legend>
              <p className="mb-2 text-xs text-neutral-500">
                Defaults: Uganda, Bushenyi, Ishaka — edit if needed.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="app-label">
                  Country
                  <input
                    value={locCountry}
                    onChange={(e) => setLocCountry(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-label">
                  District
                  <input
                    value={locDistrict}
                    onChange={(e) => setLocDistrict(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-label">
                  Town
                  <input
                    value={locTown}
                    onChange={(e) => setLocTown(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-label">
                  Village
                  <input
                    value={locVillage}
                    onChange={(e) => setLocVillage(e.target.value)}
                    placeholder="Optional"
                    className="app-input"
                  />
                </label>
              </div>
            </fieldset>
            <label className="app-label">
              Seller Name
              <input
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Enter your name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Tags / keywords
              <input
                value={itemTagsInput}
                onChange={(e) => setItemTagsInput(e.target.value)}
                placeholder="e.g. phone, used, electronics"
                className="app-input"
              />
              <span className="text-xs text-neutral-500">
                Comma-separated — helps people find your listing
              </span>
            </label>
            <label className="app-label">
              Contact
              <input
                value={itemContact}
                onChange={(e) => setItemContact(e.target.value)}
                className="app-input"
              />
            </label>
            <label className="app-label">
              WhatsApp Number (optional)
              <input
                value={itemWhatsapp}
                onChange={(e) => setItemWhatsapp(e.target.value)}
                inputMode="tel"
                placeholder="+256 7… (international format)"
                autoComplete="tel"
                className="app-input"
              />
              <span className="text-xs text-neutral-500">
                Digits only (you may type + and spaces); saved without + for the WhatsApp link.
              </span>
            </label>
          </>
        )}

        {mode === "request" && (
          <>
            <label className="app-label">
              Title
              <input
                value={reqTitle}
                onChange={(e) => setReqTitle(e.target.value)}
                placeholder="Enter product name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Description
              <textarea
                value={reqDescription}
                onChange={(e) => setReqDescription(e.target.value)}
                rows={4}
                placeholder="5 or more words"
                className="app-input min-h-[6rem]"
              />
              {reqDescription.trim().length > 0 &&
              descriptionWordCount(reqDescription) < 5 ? (
                <span className="text-xs text-neutral-500">
                  Please enter at least 5 words
                </span>
              ) : null}
            </label>
            <label className="app-label">
              Budget
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="decimal"
                placeholder="Amount"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Location
              <input
                value={reqLocation}
                onChange={(e) => setReqLocation(e.target.value)}
                placeholder="Area"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Requester Name
              <input
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Enter your name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Contact
              <input
                value={reqContact}
                onChange={(e) => setReqContact(e.target.value)}
                className="app-input"
              />
            </label>
          </>
        )}

        {mode === "shop" && (
          <>
            <label className="app-label">
              Shop Name
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="app-input"
              />
            </label>
            <label className="app-label">
              Owner Name
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Enter your name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Phone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Location
              <input
                value={shopLocation}
                onChange={(e) => setShopLocation(e.target.value)}
                placeholder="Area"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Tags / keywords
              <input
                value={shopTagsInput}
                onChange={(e) => setShopTagsInput(e.target.value)}
                placeholder="e.g. groceries, delivery"
                className="app-input"
              />
              <span className="text-xs text-neutral-500">
                Comma-separated — used for search
              </span>
            </label>
            <label className="app-label">
              Description
              <textarea
                value={shopDescription}
                onChange={(e) => setShopDescription(e.target.value)}
                rows={4}
                placeholder="5 or more words"
                className="app-input min-h-[6rem]"
              />
              {shopDescription.trim().length > 0 &&
              descriptionWordCount(shopDescription) < 5 ? (
                <span className="text-xs text-neutral-500">
                  Please enter at least 5 words
                </span>
              ) : null}
            </label>
            <label className="app-label">
              Shop photos (up to {MAX_ITEM_IMAGES})
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={onShopImagesChange}
                disabled={
                  shopImageUploading ||
                  shopImageUrls.length >= MAX_ITEM_IMAGES
                }
                className="app-input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 disabled:opacity-60"
              />
              <span className="text-xs text-neutral-500">
                Optional — storefront, logo, or products
              </span>
              {shopImageUploading ? (
                <span className="mt-1 block text-xs text-neutral-500">
                  Uploading…
                </span>
              ) : null}
            </label>
            {shopImageUrls.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shopImageUrls.map((url, idx) => (
                  <li
                    key={`${url}-${idx}`}
                    className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="mx-auto aspect-square max-h-36 w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removeShopImageAt(idx)}
                      className="absolute right-1 top-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        {mode === "service" && (
          <>
            <label className="app-label">
              Title
              <input
                value={svcTitle}
                onChange={(e) => setSvcTitle(e.target.value)}
                placeholder="Enter product name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Description
              <textarea
                value={svcDescription}
                onChange={(e) => setSvcDescription(e.target.value)}
                rows={4}
                placeholder="5 or more words"
                className="app-input min-h-[6rem]"
              />
              {svcDescription.trim().length > 0 &&
              descriptionWordCount(svcDescription) < 5 ? (
                <span className="text-xs text-neutral-500">
                  Please enter at least 5 words
                </span>
              ) : null}
            </label>
            <label className="app-label">
              Price Range
              <input
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                placeholder="Amount"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Provider Name
              <input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Enter your name"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Contact
              <input
                value={svcContact}
                onChange={(e) => setSvcContact(e.target.value)}
                className="app-input"
              />
            </label>
            <label className="app-label">
              Location
              <input
                value={svcLocation}
                onChange={(e) => setSvcLocation(e.target.value)}
                placeholder="Area"
                className="app-input"
              />
            </label>
            <label className="app-label">
              Service photos (up to {MAX_ITEM_IMAGES})
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={onSvcImagesChange}
                disabled={
                  svcImageUploading || svcImageUrls.length >= MAX_ITEM_IMAGES
                }
                className="app-input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 disabled:opacity-60"
              />
              <span className="text-xs text-neutral-500">
                Optional — portfolio or work samples
              </span>
              {svcImageUploading ? (
                <span className="mt-1 block text-xs text-neutral-500">
                  Uploading…
                </span>
              ) : null}
            </label>
            {svcImageUrls.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {svcImageUrls.map((url, idx) => (
                  <li
                    key={`${url}-${idx}`}
                    className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="mx-auto aspect-square max-h-36 w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removeSvcImageAt(idx)}
                      className="absolute right-1 top-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        <button
          type="submit"
          disabled={saving || needsSignIn || needsVerification}
          className="app-btn-primary mt-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {!saving ? "Submit" : "Posting..."}
        </button>
      </form>
    </main>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <p className="text-sm text-neutral-500">Loading…</p>
        </main>
      }
    >
      <AddPageInner />
    </Suspense>
  );
}
