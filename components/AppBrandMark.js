"use client";

import { useCallback, useState } from "react";

const APP_ICON_PNG = "/app-icon.png";
const APP_ICON_FALLBACK = "/icon.svg";

/**
 * In-app “Next” logo + wordmark. Uses `<img>` (not `next/image`) so Capacitor WebViews
 * and production builds don’t depend on the `/_next/image` optimizer for this asset.
 */
export function AppBrandMark({
  size = 32,
  wordmarkClassName = "text-xl font-black tracking-tight",
  className = "",
  showWordmark = true,
  priority = false,
}) {
  const s = Math.max(16, Number(size) || 32);
  const [src, setSrc] = useState(APP_ICON_PNG);

  const onError = useCallback(() => {
    setSrc((cur) => (cur === APP_ICON_FALLBACK ? cur : APP_ICON_FALLBACK));
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <img
        src={src}
        alt=""
        width={s}
        height={s}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onError={onError}
        className="shrink-0 rounded-lg object-cover shadow-sm"
        style={{ width: s, height: s }}
      />
      {showWordmark ? (
        <span className={wordmarkClassName}>Next</span>
      ) : null}
    </div>
  );
}
