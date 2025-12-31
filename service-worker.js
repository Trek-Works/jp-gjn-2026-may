// =====================================================
// TrekWorks Trip Mode (TTM) Service Worker
// Trip: JP / GJN-2026-May
// Scope: subdomain root (./)
// =====================================================

const CACHE_VERSION = "tw-jp-gjn-2026-may-2025-01-fallbackfix";
const CACHE_NAME = `trekworks-${CACHE_VERSION}`;

// -----------------------------------------------------
// Trip Mode storage (IndexedDB)
// -----------------------------------------------------
const DB_NAME = "trekworks";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const TRIP_MODE_KEY = "tripMode:GJN-2026-May";
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
// Core assets (FULL TRIP PRECACHE)
// -----------------------------------------------------
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",

  "./accommodation.html",
  "./activities.html",
  "./airport-limousine-bus.html",
  "./flights.html",
  "./guides.html",
  "./shopping.html",
  "./task-list-guide.html",
  "./trains.html",
  "./travel-packing-guide.html",

  "./external.html",

  "./assets/icons/icon-192x192.png",
  "./assets/icons/icon-512x512.png"
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
// Navigation strategy (FIXED FALLBACK ORDER)
// -----------------------------------------------------
async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  const isExternalRouter =
    url.pathname.endsWith("/external.html") ||
    url.pathname === "/external.html";

  const isTripDocument =
    request.destination === "document" && !isExternalRouter;

  const canonicalExternalRequest = new Request("./external.html");

  const tripMode = await getTripMode();

  // =====================================================
  // Trip Mode: OFFLINE
  // =====================================================
  if (tripMode === "offline") {

    if (isExternalRouter) {
      return (
        (await cache.match(canonicalExternalRequest)) ||
        (await cache.match("./offline.html"))
      );
    }

    if (isTripDocument) {
      return (
        (await cache.match(request)) ||
        (await cache.match("./index.html")) ||
        (await cache.match("./offline.html"))
      );
    }
  }

  // =====================================================
  // Trip Mode: ONLINE
  // =====================================================
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      if (isExternalRouter) {
        cache.put(canonicalExternalRequest, response.clone());
      } else {
        cache.put(request, response.clone());
      }
    }

    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./offline.html"))
    );
  }
}
