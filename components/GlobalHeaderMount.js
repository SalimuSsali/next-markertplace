"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBrandMark } from "./AppBrandMark";

/** Brand header on all pages except `/` (home has its own header). */
export function GlobalHeaderMount() {
  const pathname = usePathname() || "";
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-full items-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:max-w-[360px]">
        <Link
          href="/"
          className="flex items-center gap-2 no-underline"
          aria-label="Go to home"
        >
          <AppBrandMark
            size={28}
            wordmarkClassName="text-base font-black tracking-tight text-neutral-900"
            priority
          />
        </Link>
      </div>
    </header>
  );
}

