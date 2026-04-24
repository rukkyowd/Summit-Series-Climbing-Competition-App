const CACHE_NAME = "summit-series-v3";
const APP_SHELL = ["/", "/register", "/scorecard", "/leaderboard", "/manifest.json"];
const SCORECARD_DATA_PATHS = [
  "/rest/v1/climbers",
  "/rest/v1/climb_attempts",
  "/rest/v1/competition_settings",
  "/rest/v1/leaderboard_view",
];
const STATIC_ASSET_PATTERN = /\.(?:css|gif|ico|jpg|jpeg|js|json|png|svg|webp|woff2?)$/i;
const PRIVATE_PATH_PATTERN = /^\/c\/[^/]+\/scorecard$/;

function shouldBypassCache(url) {
  return (
    url.searchParams.has("token") ||
    url.pathname.startsWith("/staff") ||
    PRIVATE_PATH_PATTERN.test(url.pathname)
  );
}

function isStaticAssetRequest(url) {
  return STATIC_ASSET_PATTERN.test(url.pathname);
}

function canCacheRequest(url) {
  if (shouldBypassCache(url) || url.search) {
    return false;
  }

  return APP_SHELL.includes(url.pathname) || isStaticAssetRequest(url);
}

function isScorecardDataRequest(url) {
  return SCORECARD_DATA_PATHS.some((path) => url.pathname.includes(path));
}

async function putInCache(request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (event.request.mode === "navigate") {
    if (!canCacheRequest(requestUrl)) {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => putInCache(event.request, response))
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match("/scorecard") || caches.match("/");
        })
    );
    return;
  }

  if (isScorecardDataRequest(requestUrl)) {
    if (!canCacheRequest(requestUrl)) {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => putInCache(event.request, response))
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            return cached;
          }

          return new Response(JSON.stringify({ error: "offline-cache-miss" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        })
    );
    return;
  }

  if (!sameOrigin) {
    return;
  }

  if (!canCacheRequest(requestUrl)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => putInCache(event.request, response))
        .catch(() => caches.match("/"));
    })
  );
});
