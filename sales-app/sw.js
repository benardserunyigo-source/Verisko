// Verisko Uganda Operations — offline loading (service worker).
//
// Keeps a copy of the app on the phone so it opens with no signal; the work
// itself is already saved on the device (localStorage / IndexedDB) and syncs
// when the connection is back.
//   • Pages: network first (4 s), else the saved copy — so a new release is
//     picked up whenever there is signal.
//   • App files (app.js?v=N, css, icons, vendor libraries): saved copy first;
//     a new ?v= is a new file, so releases never mix. Older versions of the
//     same file are dropped.
//   • /api/* and other websites (Supabase, Loom…): never cached.
// Bump CACHE only when this file's own logic changes.
const CACHE = "verisko-shell-v1";
const SHELL = "/";
const NAV_TIMEOUT_MS = 4000;
const EXTRA = ["/logo.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("verisko-shell-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Save the page and every file it references.
async function precache() {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(SHELL, { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(SHELL, res);
    const urls = new Set(EXTRA);
    for (const m of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|svg|png|webmanifest)(?:\?[^"]*)?)"/g)) {
      const u = new URL(m[1], self.location.origin);
      if (u.origin === self.location.origin) urls.add(u.pathname + u.search);
    }
    await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
  } catch (e) { /* offline during install: we'll cache as we go */ }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return;
  if (req.mode === "navigate") { event.respondWith(page(req)); return; }
  event.respondWith(asset(req, url));
});

async function page(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(SHELL, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
  } catch (e) { /* offline */ }
  const saved = await cache.match(SHELL);
  if (saved) { network.catch(() => {}); return saved; }
  return network;    // nothing saved yet — wait for the network
}

async function asset(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      // Drop older versions of the same file (e.g. app.js?v=61 once ?v=62 arrives).
      if (url.search) {
        for (const k of await cache.keys()) {
          const ku = new URL(k.url);
          if (ku.pathname === url.pathname && ku.search !== url.search) await cache.delete(k);
        }
      }
      await cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    const any = await cache.match(req, { ignoreSearch: true });   // an older version beats nothing
    if (any) return any;
    throw e;
  }
}
