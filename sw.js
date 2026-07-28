const CACHE_NAME = "indomitus-tree-2026-07-28-2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/planner.css",
  "./assets/planner-data.js",
  "./assets/planner.js",
  "./assets/purchase-costs.js",
  "./assets/weapon-ranges.js",
  "./assets/research-images.js",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
  "./assets/research-sprites/research-0.webp",
  "./assets/research-sprites/research-1.webp",
  "./assets/research-sprites/research-2.webp",
  "./assets/research-sprites/research-3.webp",
  "./assets/research-sprites/research-4.webp",
  "./assets/research-sprites/research-5.webp",
  "./assets/research-sprites/research-6.webp",
  "./assets/research-sprites/research-7.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
