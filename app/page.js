"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { EmbeddedBottomTabBarMount } from "../components/EmbeddedBottomTabBarMount";
import { ItemExpiryCountdown } from "../components/ItemExpiryCountdown";
import { SearchHighlightText } from "../components/SearchHighlightText";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { filterActiveItems } from "../lib/itemLifecycle";
import {
  SEARCH_DEBOUNCE_MS,
  buildGlobalSearchIndex,
  formatItemPrice,
  rankItemSearch,
} from "../lib/globalSearch";
import { getItemTitle } from "../lib/itemFields";
import { getItemImageUrls, getItemPrimaryImageUrl } from "../lib/itemImages";
import { devError } from "../lib/devLog";
import { db } from "../lib/firebase";
import { getItemLocationSearchText } from "../lib/itemLocation";
import { itemLocationMatchesNeedle } from "../lib/locationNearby";
import { DEFAULT_CATEGORY_ID, itemMatchesCategory, normalizeCategoryId } from "../lib/categories";
import { useSearchParams } from "next/navigation";

/** Header “your area” label (no GPS); used for optional nearby alert matching */
const USER_AREA = "Your area";

/** Full viewport on phones / WebView; centered phone mockup from `md` up (desktop demos). */
const HOME_OUTER =
  "min-h-dvh w-full bg-white md:flex md:min-h-screen md:items-center md:justify-center md:bg-gray-200";
const HOME_FRAME =
  "flex min-h-0 w-full flex-col overflow-hidden bg-white max-md:h-[100dvh] max-md:max-h-[100dvh] md:h-[740px] md:w-[360px] md:flex-none md:rounded-3xl md:bg-black md:p-[6px] md:shadow-xl";
const HOME_INNER =
  "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-2xl";

function AppBrandMark() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/app-icon.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-lg shadow-sm"
        priority
      />
      <span className="text-xl font-black tracking-tight">Next</span>
    </div>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTimerRef = useRef(null);
  const latestItemsRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    DEFAULT_CATEGORY_ID,
  );
  const [userLocation, setUserLocation] = useState("");
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Prevent hydration mismatches on the phone-mockup homepage.
  // This page is highly interactive and can be affected by extensions altering the DOM.
  // We render a stable shell on the server + first client paint, then mount the real UI.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const cat = normalizeCategoryId(searchParams.get("cat"));
    setSelectedCategoryId(cat);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!db) {
          if (!cancelled) setItems([]);
          return;
        }
        const snapshot = await getDocs(collection(db, "items"));
        let data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        data = filterActiveItems(data);
        data = data.filter((item) => item.sold !== true);
        if (!cancelled) {
          setItems(data);
        }
      } catch (err) {
        devError("HomePage load items", err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const debouncedTrim = debouncedSearch.trim();
  const categoryItems = useMemo(
    () => items.filter((item) => itemMatchesCategory(item, selectedCategoryId)),
    [items, selectedCategoryId],
  );
  const searchIndex = useMemo(
    () => buildGlobalSearchIndex(categoryItems),
    [categoryItems],
  );
  const rankedSearch = useMemo(
    () =>
      rankItemSearch(categoryItems, debouncedTrim, searchIndex, { limit: 20 }),
    [categoryItems, debouncedTrim, searchIndex],
  );

  useEffect(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    const q = debouncedSearch.trim();
    if (!q || loading || rankedSearch.results.length > 0) {
      return;
    }

    const delayMs = 1200;
    redirectTimerRef.current = setTimeout(() => {
      redirectTimerRef.current = null;
      router.push(`/requests?title=${encodeURIComponent(q)}`);
    }, delayMs);

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [debouncedSearch, rankedSearch.results.length, loading, router]);

  const hasSearch = searchTerm.trim() !== "";
  const debouncedHasSearch = debouncedSearch.trim() !== "";
  const searchPending = hasSearch && searchTerm.trim() !== debouncedSearch.trim();
  const displayItems = useMemo(
    () => (debouncedTrim ? rankedSearch.results.map((r) => r.item) : categoryItems),
    [debouncedTrim, rankedSearch, categoryItems],
  );

  const anyFiltersActive =
    debouncedTrim !== "" || selectedCategoryId !== DEFAULT_CATEGORY_ID;

  function clearFilters() {
    setSearchTerm("");
    setSelectedCategoryId(DEFAULT_CATEGORY_ID);
    router.replace("/");
  }

  const showFloatingAlert = useMemo(() => {
    if (alertDismissed || loading) return false;
    const needle = (searchTerm.trim() || USER_AREA).toLowerCase();
    const hasAnyLocation = items.some(
      (i) => getItemLocationSearchText(i).trim() !== "",
    );
    if (!hasAnyLocation) {
      return items.length > 0;
    }
    return items.some((i) =>
      itemLocationMatchesNeedle(getItemLocationSearchText(i), needle),
    );
  }, [alertDismissed, items, loading, searchTerm]);

  function scrollToLatestItems() {
    latestItemsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleFindNearby() {
    const raw = userLocation.trim();
    if (!raw) return;
    router.push(`/items?near=${encodeURIComponent(raw)}`);
  }

  if (!mounted) {
    return (
      <div className={HOME_OUTER}>
        <div className={HOME_FRAME}>
          <div className={HOME_INNER}>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="border-b border-gray-200 bg-emerald-600 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
                <AppBrandMark />
                <div className="mt-3 h-11 w-full rounded-xl bg-white/20" aria-hidden />
              </div>
              <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pb-6 pt-4">
                <p className="py-6 text-center text-sm text-neutral-500">
                  Loading…
                </p>
              </main>
              <EmbeddedBottomTabBarMount />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={HOME_OUTER}>
      <div className={HOME_FRAME}>
        <div className={HOME_INNER}>
          <div
            className="hidden shrink-0 justify-center bg-white pt-2 md:flex"
            aria-hidden
          >
            <div className="h-5 w-24 rounded-full bg-black" />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-white shadow-sm">
              <header className="shrink-0">
                <div className="border-b border-gray-200 bg-emerald-600 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
                  <div className="flex items-center justify-between gap-2">
                    <AppBrandMark />
                    <div className="flex items-center gap-2">
                      <Link
                        href="/safety"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-base no-underline"
                        aria-label="Security and safety tips"
                      >
                        {"\u26A0\uFE0F"}
                      </Link>
                      <Link
                        href="/notifications"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-base no-underline"
                        aria-label="Notifications"
                      >
                        <span aria-hidden>{"\u{1F514}"}</span>
                      </Link>
                      <Link
                        href="/profile"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-base no-underline"
                        aria-label="Profile"
                      >
                        <span aria-hidden>{"\u{1F464}"}</span>
                      </Link>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Find anything in</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"
                      aria-label="Location"
                    >
                      <span aria-hidden>{"\u{1F4CD}"}</span>
                      <span>{USER_AREA}</span>
                    </button>
                  </div>

                  <label className="sr-only" htmlFor="home-search">
                    Search items
                  </label>
                  <div className="relative mt-3">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-emerald-700/70"
                      aria-hidden
                    >
                      {"\u{1F50D}"}
                    </span>
                    <input
                      id="home-search"
                      type="search"
                      name="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="I am looking for..."
                      autoComplete="off"
                      className="w-full rounded-xl bg-white py-3 pl-10 pr-3 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                    {hasSearch ? (
                      <div
                        className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(70vh,22rem)] overflow-auto rounded-xl border border-emerald-100 bg-white py-1 shadow-lg"
                        aria-busy={searchPending}
                      >
                        {searchPending ? (
                          <p className="px-3 py-2 text-xs text-neutral-500">
                            Searching…
                          </p>
                        ) : null}
                        {!searchPending &&
                        debouncedHasSearch &&
                        rankedSearch.wasChanged ? (
                          <p className="border-b border-emerald-50 px-3 py-2 text-xs text-neutral-600">
                            <span className="font-semibold text-emerald-800">
                              Did you mean:
                            </span>{" "}
                            <span className="italic text-neutral-800">
                              {rankedSearch.correctedQuery}
                            </span>
                          </p>
                        ) : null}
                        {!searchPending &&
                        debouncedHasSearch &&
                        rankedSearch.results.length === 0 ? (
                          <div className="px-3 py-4 text-center">
                            <p className="text-sm font-semibold text-neutral-800">
                              No results found
                            </p>
                            <p className="mt-1 text-xs text-neutral-600">
                              Try different keywords or check spelling.
                            </p>
                          </div>
                        ) : null}
                        {!searchPending &&
                        debouncedHasSearch &&
                        rankedSearch.results.length > 0 ? (
                          <ul className="m-0 list-none p-0" role="listbox">
                            {rankedSearch.results.map(({ item }) => {
                              const url = getItemPrimaryImageUrl(item);
                              const terms = rankedSearch.highlightTerms;
                              const locLine = getItemLocationSearchText(item);
                              return (
                                <li key={item.id} role="option">
                                  <Link
                                    href={`/items/${item.id}`}
                                    className="flex gap-2 px-3 py-2 text-sm no-underline transition hover:bg-emerald-50"
                                  >
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                                      {url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-[10px] text-neutral-400">
                                          —
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium leading-tight text-neutral-900">
                                        <SearchHighlightText
                                          text={getItemTitle(item)}
                                          terms={terms}
                                        />
                                      </div>
                                      <div className="mt-0.5 text-xs font-semibold text-emerald-800">
                                        {formatItemPrice(item)}
                                      </div>
                                      {locLine ? (
                                        <span className="mt-0.5 line-clamp-1 block text-xs text-neutral-500">
                                          {locLine}
                                        </span>
                                      ) : null}
                                    </div>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pb-6 pt-4">
                  <h2
                    id="latest-items"
                    ref={latestItemsRef}
                    className="mt-5 scroll-mt-4 text-base font-bold text-neutral-900"
                  >
                    {selectedCategoryId !== DEFAULT_CATEGORY_ID
                      ? "Items"
                      : "Latest Items"}
                  </h2>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Link
                      href="/categories"
                      className="text-xs font-semibold text-emerald-800 underline decoration-emerald-600/40 underline-offset-2"
                    >
                      Browse categories
                    </Link>
                    {anyFiltersActive ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-xs font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-2"
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    {loading ? (
                      <p className="py-6 text-center text-sm text-neutral-500">
                        Loading…
                      </p>
                    ) : items.length === 0 ? (
                      <p className="py-6 text-center text-sm text-neutral-500">
                        No items yet
                      </p>
                    ) : !searchPending && displayItems.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-sm font-semibold text-neutral-800">
                          No items found
                        </p>
                        <p className="mt-1 text-xs text-neutral-600">
                          Try another category or different search words.
                        </p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-3 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {displayItems.map((item) => {
                          const url = getItemPrimaryImageUrl(item);
                          const imageCount = getItemImageUrls(item).length;

                          return (
                            <Link
                              key={item.id}
                              href={`/items/${item.id}`}
                              className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm no-underline text-inherit transition hover:shadow-md"
                            >
                              <div className="relative aspect-square w-full bg-gray-100">
                                {url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={url}
                                    alt=""
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.01]"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-neutral-500">
                                    No Image
                                  </div>
                                )}

                                {/* soft gradient so overlay text never “collides” with the image */}
                                <div
                                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent"
                                  aria-hidden
                                />

                                {imageCount > 1 ? (
                                  <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                                    +{imageCount - 1}
                                  </div>
                                ) : null}

                                <div className="absolute inset-x-0 bottom-0 p-2">
                                  <p className="line-clamp-2 text-xs font-bold leading-snug text-white">
                                    {getItemTitle(item)}
                                  </p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-white/95">
                                    {formatItemPrice(item)}
                                  </p>
                                  <div className="mt-1">
                                    <ItemExpiryCountdown
                                      expiresAt={item.expiresAt}
                                      className="text-[10px] text-white/95 drop-shadow-sm"
                                    />
                                  </div>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </main>

                {showFloatingAlert ? (
                  <div
                    className="pointer-events-none absolute bottom-[5.5rem] left-1/2 z-30 w-[90%] max-w-[324px] -translate-x-1/2"
                    role="status"
                  >
                    <div className="home-float-alert-animate pointer-events-auto relative rounded-xl bg-green-600 text-white shadow-lg">
                      <button
                        type="button"
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-white hover:bg-white/15"
                        aria-label="Dismiss"
                        onClick={() => setAlertDismissed(true)}
                      >
                        {"\u2716"}
                      </button>
                      <div className="p-3 pr-10">
                        <div
                          className="cursor-pointer"
                          onClick={scrollToLatestItems}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              scrollToLatestItems();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label="Scroll to Latest Items"
                        >
                          <div className="flex gap-2 pr-1">
                            <span className="shrink-0 text-lg" aria-hidden>
                              {"\u{1F4CD}"}
                            </span>
                            <div>
                              <p className="text-sm font-semibold leading-snug">
                                New items posted near your area
                              </p>
                              <p className="mt-1 text-xs leading-snug text-white/90">
                                Check latest listings close to you
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-2">
                          <input
                            value={userLocation}
                            onChange={(e) => setUserLocation(e.target.value)}
                            placeholder="Enter your location"
                            className="w-full rounded-lg px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-white/40"
                          />
                          <button
                            type="button"
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-green-700 shadow-sm hover:bg-white/95"
                            onClick={handleFindNearby}
                          >
                            Find Nearby
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <EmbeddedBottomTabBarMount />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className={HOME_OUTER}>
          <div className={HOME_FRAME}>
            <div className={HOME_INNER}>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="border-b border-gray-200 bg-emerald-600 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
                  <AppBrandMark />
                  <div className="mt-3 h-11 w-full rounded-xl bg-white/20" aria-hidden />
                </div>
                <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pb-6 pt-4">
                  <p className="py-6 text-center text-sm text-neutral-500">
                    Loading…
                  </p>
                </main>
                <EmbeddedBottomTabBarMount />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}
