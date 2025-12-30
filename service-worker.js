// =====================================================
// TrekWorks Trip Mode (TTM) Service Worker
// Trip: JP / GJN-2026-May
// Scope: /JP/GJN-2026-May/
// =====================================================

const CACHE_VERSION = "tw-jp-gjn-2026-may-2024-12-22";
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
// Core assets (EXPLICIT PRE-CACHE)
// -----------------------------------------------------
const CORE_ASSETS = [
  "/JP/GJN-2026-May/",
  "/JP/GJN-2026-May/index.html",

  "/JP/GJN-2026-May/accommodation.html",
  "/JP/GJN-2026-May/activities.html",
  "/JP/GJN-2026-May/airport-limousine-bus.html",
  "/JP/GJN-2026-May/flights.html",
  "/JP/GJN-2026-May/guides.html",
  "/JP/GJN-2026-May/shopping.html",
  "/JP/GJN-2026-May/task-list-guide.html",
  "/JP/GJN-2026-May/trains.html",
  "/JP/GJN-2026-May/travel-packing-guide.html",

  "/JP/GJN-2026-May/external.html",
  "/JP/GJN-2026-May/offline.html",

  "/JP/GJN-2026-May/manifest.json",
  "/JP/GJN-2026-May/assets/icons/icon-192x192.png",
  "/JP/GJN-2026-May/assets/icons/icon-512x512.png"
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
// Navigation strategy
// -----------------------------------------------------
async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  const inTripScope = url.pathname.startsWith("/JP/GJN-2026-May/");
  const isExternalRouter =
    url.pathname === "/JP/GJN-2026-May/external.html";

  const isTripDocument =
    inTripScope &&
    request.destination === "document" &&
    !isExternalRouter;

  const canonicalExternalRequest = new Request(
    "/JP/GJN-2026-May/external.html"
  );

  const tripMode = await getTripMode();

  // =====================================================
  // Trip Mode: OFFLINE
  // =====================================================
  if (tripMode === "offline") {

    // External router stays special
    if (isExternalRouter) {
      const cached = await cache.match(canonicalExternalRequest);
      if (cached) return cached;
      return cache.match("/JP/GJN-2026-May/offline.html");
    }

    // Any normal trip HTML page → serve from cache if available
    if (isTripDocument) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    return cache.match("/JP/GJN-2026-May/offline.html");
  }

  // =====================================================
  // Trip Mode: ONLINE
  // =====================================================
  try {
    const response = await fetch(request);

    if (response && response.ok && inTripScope) {
      if (isExternalRouter) {
        cache.put(canonicalExternalRequest, response.clone());
      } else {
        cache.put(request, response.clone());
      }
    }

    return response;
  } catch {
    if (isExternalRouter) {
      const cached = await cache.match(canonicalExternalRequest);
      if (cached) return cached;
    }

    const cached = await cache.match(request);
    if (cached) return cached;

    return cache.match("/JP/GJN-2026-May/offline.html");
  }
}
