"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * @param {{ variant?: "fixed" | "embedded" }} props
 * - fixed: full-viewport bar (default)
 * - embedded: sits in document flow at bottom of a container (e.g. phone mockup)
 */
export function BottomTabBar({ variant = "fixed" }) {
  const pathname = usePathname() || "";

  const isShops = pathname === "/shops" || pathname.startsWith("/shops/");
  /** Items icon opens the full home feed (`/`); stay “active” on `/items` too for continuity. */
  const isHomeOrItems =
    pathname === "/" ||
    pathname === "/items" ||
    pathname.startsWith("/items/");
  const isAdd = pathname === "/add";
  const isServices =
    pathname === "/services" || pathname.startsWith("/services/");
  const isRequests =
    pathname === "/requests" || pathname.startsWith("/requests/");
  const isRentals =
    pathname === "/rentals" || pathname.startsWith("/rentals/");
  const isCategories = pathname === "/categories";

  const navClass =
    variant === "embedded"
      ? "relative z-40 shrink-0 border-t border-gray-200 bg-white py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.06)]"
      : "fixed bottom-0 left-0 right-0 z-50 w-full border-t border-gray-200 bg-white py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.06)]";

  function sideTab(active) {
    return `flex min-w-0 flex-1 flex-col items-center gap-0 overflow-hidden rounded-md px-0 py-0.5 no-underline transition ${
      active ? "text-neutral-900" : "text-gray-400"
    }`;
  }

  const innerPad =
    variant === "fixed" ? "w-full md:mx-auto md:max-w-[360px]" : "";
  /** Tiny labels + ellipsis so seven tabs fit narrow widths without overlapping. */
  const labelClass =
    "block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[7px] font-medium leading-none tracking-tight";

  return (
    <nav className={navClass} aria-label="Main navigation">
      <div
        className={`flex w-full flex-row flex-nowrap items-end justify-between gap-0 px-1 ${innerPad}`}
      >
        <Link
          href="/shops"
          className={sideTab(isShops)}
          aria-current={isShops ? "page" : undefined}
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F3EA}"}
          </span>
          <span className={labelClass}>Shops</span>
        </Link>

        <Link
          href="/"
          className={sideTab(isHomeOrItems)}
          aria-current={isHomeOrItems ? "page" : undefined}
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F4E6}"}
          </span>
          <span className={labelClass}>Items</span>
        </Link>

        <Link
          href="/add"
          className="-mt-3 flex min-w-0 flex-1 flex-col items-center gap-0 overflow-hidden rounded-lg px-0 py-0.5 no-underline"
          aria-current={isAdd ? "page" : undefined}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold leading-none text-white shadow-md transition sm:h-10 sm:w-10 sm:text-lg ${
              isAdd
                ? "bg-green-700 ring-2 ring-green-800/40"
                : "bg-green-600 ring-2 ring-green-700/30 hover:bg-green-700"
            }`}
            aria-hidden
          >
            {"\u2795"}
          </span>
          <span
            className={`${labelClass} ${
              isAdd ? "text-neutral-900" : "text-gray-400"
            }`}
          >
            Post
          </span>
        </Link>

        <Link
          href="/services"
          className={sideTab(isServices)}
          aria-current={isServices ? "page" : undefined}
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F6E0}\u{FE0F}"}
          </span>
          <span className={labelClass}>Services</span>
        </Link>

        <Link
          href="/requests"
          className={sideTab(isRequests)}
          aria-current={isRequests ? "page" : undefined}
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F4E2}"}
          </span>
          <span className={labelClass}>Requests</span>
        </Link>

        <Link
          href="/rentals"
          className={sideTab(isRentals)}
          aria-current={isRentals ? "page" : undefined}
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F3E0}"}
          </span>
          <span className={labelClass}>Rentals</span>
        </Link>

        <Link
          href="/categories"
          className={sideTab(isCategories)}
          aria-current={isCategories ? "page" : undefined}
          aria-label="Categories"
        >
          <span className="shrink-0 text-[1rem] leading-none" aria-hidden>
            {"\u{1F5C2}\uFE0F"}
          </span>
          <span className={labelClass}>Categories</span>
        </Link>
      </div>
    </nav>
  );
}

/** Full-width fixed tab bar; hidden on `/` where the phone mockup embeds its own bar. */
export function GlobalBottomTabBar() {
  const pathname = usePathname() || "";
  if (pathname === "/") return null;
  return <BottomTabBar variant="fixed" />;
}
