// =====================================================
// TrekWorks Trip Mode (TTM) Service Worker
// Trip: JP / GJN-2026-May
// Host: jp-gjn-2026-may.trekworks.org (subdomain root)
// Scope: /
// =====================================================

const CACHE_VERSION = "tw-jp-gjn-2026-may-2025-01-01";
const CACHE_NAME = `trekworks-${CACHE_VERSION}`;

// -----------------------------------------------------
// Trip Mode storage (IndexedDB)
// -----------------------------------------------------
const DB_NAME = "trekworks";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const TRIP_MODE_KEY = "tripMode";
const DEFAULT_MODE = "online";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getTripMode() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(TRIP_MODE_KEY);
      req.onsuccess = () => resolve(req.result || DEFAULT_MODE);
      req.onerror = () => resolve(DEFAULT_MODE);
    });
  } catch {
    return DEFAULT_MODE;
  }
}

// -----------------------------------------------------
// Core assets (EXPLICIT PRE-CACHE) - subdomain root
// -----------------------------------------------------
const CORE_ASSETS = [
  "/",
  "/index.html",

  "/accommodation.html",
  "/activities.html",
  "/airport-limousine-bus.html",
  "/flights.html",
  "/guides.html",
  "/shopping.html",
  "/task-list-guide.html",
  "/trains.html",
  "/travel-packing-guide.html",

  "/external.html",
  "/offline.html",

  "/manifest.json",
  "/assets/icons/icon-192x192.png",
  "/assets/icons/icon-512x512.png"
];

// -----------------------------------------------------
// Install
// -----------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// -----------------------------------------------------
// Activate
// -----------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("trekworks-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// -----------------------------------------------------
// Fetch handling (navigation only)
// -----------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(handleNavigation(event.request));
});

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function isRedirectResponse(response) {
  if (!response) return false;
  // response.redirected can be true even when status is 200 in some cases,
  // but for navigations we treat any redirected response as "do not follow".
  if (response.redirected) return true;
  return response.status >= 300 && response.status < 400;
}

function normalisePathname(pathname) {
  // Ensure "/" and "/index.html" behave consistently.
  if (pathname === "/") return "/index.html";
  return pathname;
}

// -----------------------------------------------------
// Navigation strategy
// -----------------------------------------------------
async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  const isSameOrigin = url.origin === self.location.origin;
  const pathname = url.pathname;

  const isExternalRouter = isSameOrigin && pathname === "/external.html";

  // Any same-origin document except the external router
  const isTripDocument =
    isSameOrigin &&
    request.destination === "document" &&
    !isExternalRouter;

  const canonicalExternalRequest = new Request("/external.html");

  const tripMode = await getTripMode();

  // =====================================================
  // Trip Mode: OFFLINE
  // =====================================================
  if (tripMode === "offline") {
    if (isExternalRouter) {
      const cached = await cache.match(canonicalExternalRequest);
      if (cached) return cached;
      return cache.match("/offline.html");
    }

    if (isTripDocument) {
      const normalised = new Request(normalisePathname(pathname));
      const cached = await cache.match(normalised);
      if (cached) return cached;

      // If the user requested "/" and we only have "/index.html" cached
      const indexFallback = await cache.match("/index.html");
      if (indexFallback) return indexFallback;
    }

    return cache.match("/offline.html");
  }

  // =====================================================
  // Trip Mode: ONLINE
  // =====================================================
  try {
    const response = await fetch(request);

    // IMPORTANT:
    // If the server (or Cloudflare) returns a redirect that points to trekworks.org,
    // we do NOT want the browser to follow it. Serve cached content instead.
    if (isTripDocument && isRedirectResponse(response)) {
      const normalised = new Request(normalisePathname(pathname));
      const cached = await cache.match(normalised);
      if (cached) return cached;

      const indexFallback = await cache.match("/index.html");
      if (indexFallback) return indexFallback;

      return cache.match("/offline.html");
    }

    // Cache successful, same-origin navigations
    if (response && response.ok && isTripDocument) {
      const normalisedPath = normalisePathname(pathname);

      if (isExternalRouter) {
        cache.put(canonicalExternalRequest, response.clone());
      } else {
        cache.put(new Request(normalisedPath), response.clone());

        // Also keep "/" effectively cached by ensuring index is cached
        if (normalisedPath === "/index.html") {
          cache.put(new Request("/"), response.clone());
        }
      }
    }

    return response;
  } catch {
    if (isExternalRouter) {
      const cached = await cache.match(canonicalExternalRequest);
      if (cached) return cached;
      return cache.match("/offline.html");
    }

    if (isTripDocument) {
      const normalised = new Request(normalisePathname(pathname));
      const cached = await cache.match(normalised);
      if (cached) return cached;

      const indexFallback = await cache.match("/index.html");
      if (indexFallback) return indexFallback;
    }

    return cache.match("/offline.html");
  }
}
