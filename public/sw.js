/* eslint-disable no-restricted-globals */
const CACHE_STATIC = "marketplace-app-43621-static-v2";
const CACHE_PAGES = "marketplace-app-43621-pages-v2";

self.addEventListener("install", (event) => {
  const precache = [
    "/offline",
    "/manifest.json",
    "/app-icon.png",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
  ];
  event.waitUntil(
    caches
      .open(CACHE_PAGES)
      .then((cache) =>
        Promise.all(precache.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_STATIC && k !== CACHE_PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Icons / vector fallback: cache-first (do not intercept `/sw.js` — updates must hit the network).
  if (
    url.pathname === "/app-icon.png" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(
      caches.open(CACHE_PAGES).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        }),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_STATIC).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request.url, { cache: "no-cache", credentials: request.credentials }))
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_PAGES).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.match("/offline") ||
              new Response("<!DOCTYPE html><html><body><p>Offline</p></body></html>", {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              }),
          ),
        ),
    );
  }
});
