"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { ItemExpiryWarning } from "../../components/ExpiryWarning";
import { SearchHighlightText } from "../../components/SearchHighlightText";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFirebaseBootstrapVersion } from "../../hooks/useFirebaseBootstrapVersion";
import { ItemExpiryCountdown } from "../../components/ItemExpiryCountdown";
import { isExpiringSoon } from "../../lib/expiry";
import {
  filterActiveItems,
  nextItemExpiresAfterRenewClient,
  renewItem as renewItemInFirestore,
} from "../../lib/itemLifecycle";
import {
  SEARCH_DEBOUNCE_MS,
  formatItemPrice,
} from "../../lib/globalSearch";
import { getItemTitle } from "../../lib/itemFields";
import { getItemPrimaryImageUrl } from "../../lib/itemImages";
import { db } from "../../lib/firebase";
import { CategoryGrid } from "../../components/CategoryGrid";
import { ItemCardChatWaRow } from "../../components/ItemCardChatWaRow";
import {
  DEFAULT_CATEGORY_ID,
  getItemCategoryId,
  normalizeCategoryId,
} from "../../lib/categories";
import { getItemLocationSearchText } from "../../lib/itemLocation";
import {
  filterAndSortItemsByNearby,
  itemLocationMatchesNeedle,
  sortItemsByLocationMatch,
} from "../../lib/locationNearby";
function ItemsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Independent filter states (category + search)
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [failedImagesById, setFailedImagesById] = useState({});
  const [renewingId, setRenewingId] = useState(null);
  const fbBoot = useFirebaseBootstrapVersion();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        if (!db) {
          setItems([]);
          return;
        }
        const snapshot = await getDocs(collection(db, "items"));
        let data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        const now = new Date();
        data = filterActiveItems(data, now);
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [fbBoot]);

  async function onRenewItemClick(item) {
    if (!db || !item?.id) return;
    setRenewingId(item.id);
    try {
      await renewItemInFirestore(db, item.id);
      const next = nextItemExpiresAfterRenewClient();
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, expiresAt: next, status: "active" } : i,
        ),
      );
    } catch (err) {
      alert("Could not renew post.");
    } finally {
      setRenewingId(null);
    }
  }

  // Safety fallback
  const safeItems = items || [];

  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const debouncedTrim = debouncedSearch.trim().toLowerCase();

  const nearParam = useMemo(
    () => (searchParams.get("near") ?? "").trim(),
    [searchParams],
  );

  /** Keep `?q=` when dropping `?near=` from the home “Find nearby” flow. */
  const hrefClearNear = useMemo(() => {
    const t = searchQuery.trim();
    return t ? `/items?q=${encodeURIComponent(t)}` : "/items";
  }, [searchQuery]);

  const normalizedCategory = useMemo(
    () => normalizeCategoryId(selectedCategory),
    [selectedCategory],
  );

  // 1) Category filter FIRST
  const categoryFilteredItems = useMemo(() => {
    return normalizedCategory === "all"
      ? safeItems
      : safeItems.filter((item) => getItemCategoryId(item) === normalizedCategory);
  }, [safeItems, normalizedCategory]);

  // 2) Search filter SECOND (within category results)
  const finalItems = useMemo(() => {
    if (!debouncedTrim) return categoryFilteredItems;
    return categoryFilteredItems.filter((item) => {
      const title = getItemTitle(item).toLowerCase();
      const desc = String(item?.description ?? "").toLowerCase();
      return title.includes(debouncedTrim) || desc.includes(debouncedTrim);
    });
  }, [categoryFilteredItems, debouncedTrim]);

  // Optional: nearby filter applied after the two required filters
  const displayItems = useMemo(() => {
    if (!nearParam) return finalItems;
    if (debouncedTrim) {
      const next = finalItems.filter((item) =>
        itemLocationMatchesNeedle(getItemLocationSearchText(item), nearParam),
      );
      return sortItemsByLocationMatch(next, nearParam);
    }
    return filterAndSortItemsByNearby(finalItems, nearParam);
  }, [finalItems, nearParam, debouncedTrim]);

  const hasSearch = searchQuery.trim() !== "";
  const searchPending = hasSearch && searchQuery.trim() !== debouncedSearch.trim();
  const searchNoResults =
    !searchPending &&
    Boolean(debouncedTrim) &&
    displayItems.length === 0 &&
    categoryFilteredItems.length > 0;

  const nearOnlyNoResults =
    !searchPending &&
    Boolean(nearParam) &&
    !Boolean(debouncedTrim) &&
    categoryFilteredItems.length > 0 &&
    displayItems.length === 0;

  const anyFiltersActive =
    Boolean(debouncedTrim) || normalizedCategory !== DEFAULT_CATEGORY_ID;

  function clearFilters() {
    setSearchQuery("");
    setSelectedCategory(DEFAULT_CATEGORY_ID);
  }

  function openRequestFlow() {
    const t = searchQuery.trim();
    router.push(`/add?mode=request&title=${encodeURIComponent(t)}`);
  }

  return (
    <main className="app-shell relative z-0">
      <h1 className="app-title">Items</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Smart search: title, tags, and description (typo-tolerant).
      </p>

      {nearParam ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950">
          <span>
            <span className="font-semibold">Near:</span>{" "}
            <span className="text-emerald-900">{nearParam}</span>
            <span className="text-emerald-800/90">
              {" "}
              — sorted by closest text match to this location.
            </span>
          </span>
          <Link
            href={hrefClearNear}
            className="shrink-0 font-semibold text-emerald-800 underline decoration-emerald-600/50 underline-offset-2"
          >
            Clear location
          </Link>
        </div>
      ) : null}

      <label className="sr-only" htmlFor="items-search">
        Search items
      </label>
      <div className="relative z-20 mt-4">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-neutral-400"
          aria-hidden
        >
          🔍
        </span>
        <input
          id="items-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items…"
          autoComplete="off"
          className="app-search"
        />
        {anyFiltersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-xs font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2"
          >
            Clear filters
          </button>
        ) : null}
        {searchPending ? (
          <p className="mt-2 text-xs text-neutral-500">Searching…</p>
        ) : null}
      </div>

      <div className="mt-5">
        <CategoryGrid
          selectedId={normalizedCategory}
          onSelect={setSelectedCategory}
          columns={2}
          size="md"
          label="Browse by category"
          helpText="Category filters the list below. Search filters within the selected category."
        />
      </div>

      {loading ? (
        <p className="app-empty">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4 py-6">
          <p className="app-empty text-center">No items yet.</p>
          <button
            type="button"
            onClick={openRequestFlow}
            className="app-btn-primary max-w-[260px] text-sm"
          >
            Post Request
          </button>
        </div>
      ) : !searchPending && items.length > 0 && displayItems.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-800">No items found</p>
          <p className="max-w-sm text-xs text-neutral-600">
            Try changing the category or search words.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={clearFilters}
              className="app-btn-primary max-w-[260px] text-sm"
            >
              Clear Filters
            </button>
            {searchNoResults ? (
              <button
                type="button"
                onClick={openRequestFlow}
                className="app-btn-secondary max-w-[260px] text-sm"
              >
                Post a request
              </button>
            ) : null}
          </div>
        </div>
      ) : searchNoResults ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-800">
            No results found
          </p>
          <p className="max-w-sm text-xs text-neutral-600">
            Try different keywords.
          </p>
          <button
            type="button"
            onClick={openRequestFlow}
            className="app-btn-primary max-w-[260px] text-sm"
          >
            Post a request
          </button>
        </div>
      ) : nearOnlyNoResults ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-800">
            No items found near this location
          </p>
          <p className="max-w-sm text-xs text-neutral-600">
            No listings matched your area text. Try a broader neighborhood or{" "}
            <Link
              href={`/requests?title=${encodeURIComponent(nearParam)}`}
              className="font-semibold text-emerald-800 underline"
            >
              post a request
            </Link>
            .
          </p>
          <Link
            href={hrefClearNear}
            className="text-sm font-semibold text-emerald-800 underline"
          >
            Clear location filter
          </Link>
        </div>
      ) : (
        <div className="app-list">
          {displayItems.map((item) => {
            const thumbUrl = getItemPrimaryImageUrl(item);
            const hasImage = Boolean(thumbUrl);
            const failed = Boolean(failedImagesById[item.id]);
            const soon = isExpiringSoon(item.expiresAt);

            return (
              <div
                key={item.id}
                className={`app-card-link overflow-hidden no-underline text-inherit ${
                  soon ? "ring-2 ring-amber-400/90" : ""
                }`}
              >
                <Link
                  href={`/items/${item.id}`}
                  className="block no-underline text-inherit"
                >
                  <div className="app-item-row">
                    <div className="h-[150px] w-full shrink-0 overflow-hidden bg-neutral-100 sm:w-64">
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
                    <div className="app-card-body">
                      <div className="app-card-title">
                        {getItemTitle(item)}
                      </div>
                      <div className="app-card-meta">{formatItemPrice(item)}</div>
                      <div className="app-card-meta">
                        {getItemLocationSearchText(item)}
                      </div>
                      <ItemExpiryCountdown
                        expiresAt={item.expiresAt}
                        className="mt-1 text-left"
                      />
                    </div>
                  </div>
                </Link>
                <ItemCardChatWaRow item={item} />
                {soon ? (
                  <div
                    className="border-t border-amber-200 bg-amber-50/95 px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ItemExpiryWarning
                      onRenew={() => onRenewItemClick(item)}
                      busy={renewingId === item.id}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function ItemsPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <p className="app-empty">Loading…</p>
        </main>
      }
    >
      <ItemsPageInner />
    </Suspense>
  );
}
