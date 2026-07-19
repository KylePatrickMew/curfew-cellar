/* The Curfew Cellar -- service worker.
   Two jobs: (1) receive push messages and show them as notifications, bringing the app to
   the front when tapped, and (2) cache the app shell at runtime so the app can still open
   with no signal, which is exactly where a pub cellar tends to sit. Lives at public/sw.js.

   The build is Vite with hashed asset filenames that change every deploy, and there's no
   build-time manifest available here to precache them by name. So rather than precache a
   fixed list at install time, this caches whatever loads successfully as it's requested, and
   falls back to that cache when the network fails or is too slow to answer. That means the
   very first-ever load of the app still needs a signal; every load after that has a fallback.

   Cache name is versioned by hand (bump CACHE_VERSION when this file's caching logic changes
   in a way that means old cached entries should be dropped). The existing "Reset app cache"
   button in Backup & Restore already deletes every cache by key regardless of name, so it
   remains the full recovery path if this ever misbehaves; nothing here needs to know about it. */

const CACHE_VERSION = "curfew-shell-v1";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only ever cache our own GET requests. POSTs (the Anthropic proxy, the notify endpoint,
  // Supabase writes) and anything cross-origin (Supabase itself) always go straight to the
  // network, untouched: caching a POST is meaningless, and caching Supabase responses risks
  // silently serving stale cellar data instead of the real-time cloud copy.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS));
      try {
        const fresh = await Promise.race([fetch(req), timeout]);
        if (fresh && fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        // Offline, or the network didn't answer in time: fall back to whatever's cached.
        const cached = await caches.match(req);
        if (cached) return cached;
        // Nothing cached for this exact request, most likely the very first load with no
        // signal at all. For a page navigation, fall back to the cached root shell if there
        // is one, so the app still opens to whatever was last loaded rather than a browser
        // error page.
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw e;
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* fall through */ }
  const title = data.title || "The Curfew Cellar";
  const body = data.body || "Something changed in the cellar.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "curfew-cellar",
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
