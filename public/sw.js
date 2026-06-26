// v27.6.4.2 — two-cache split. v27.6.4.1 had a single CACHE_NAME that
// bumped per release, with the activate handler nuking any cache name
// that didn't match. That meant EVERY release wiped the user's cached
// navigations. Flavio testing on his phone PWA: tapped offline-page
// "Open dashboard" and looped right back to offline.html — because his
// post-update cache had only the precache list (offline.html + a few
// icons), no app pages.
//
// Fix:
//   bitebook-shell-vXX  — versioned shell cache. Holds the precache
//                         list + content-hashed Next.js bundles +
//                         static images. NUKED on activate when the
//                         version doesn't match. This is the cache-
//                         busting story that the old single CACHE_NAME
//                         was trying to do.
//   bitebook-runtime    — UNVERSIONED runtime cache. Holds navigation
//                         HTML and dynamic data the user actually
//                         visited. Persists across releases so the
//                         user's offline app shell survives every
//                         deploy. Never nuked by the activate handler.
//
// Net effect: user visits /app/h once while online → cached forever
// in bitebook-runtime. Subsequent releases bump SHELL_CACHE (fresh
// CSS/JS) but leave runtime alone (offline app keeps working).

const SHELL_CACHE = 'bitebook-shell-v28.1.0f.2'
const RUNTIME_CACHE = 'bitebook-runtime'

// Pre-cache list. /offline.html is the universal fallback for failed
// navigations. The rest are static shell assets that never change
// per-deploy or are content-hashed by Next.
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/bb-logo.png',
]

// Synthetic last-resort responses. Used only when even the pre-cached
// /offline.html is missing. Returning a real Response object keeps
// respondWith from rejecting and triggering Safari's "Returned
// response is null" error.
function syntheticOfflineHTML() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>'
    + '<style>body{font-family:system-ui;background:#0B0806;color:#F4EFE5;padding:2rem;text-align:center}</style>'
    + "<h1>You're offline</h1>"
    + '<p>Please reconnect to continue.</p>'
    + '<p><button onclick="location.reload()" style="background:#B06C3C;color:#fff;border:0;padding:.6rem 1.2rem;border-radius:.4rem;font-weight:700">Retry</button></p>',
    { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function syntheticOfflineGeneric() {
  return new Response('', {
    status: 504,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain' },
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Best-effort precache: a single missing asset doesn't fail the
      // entire install. addAll() is all-or-nothing; we want each
      // resource attempt isolated.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res && res.ok) return cache.put(url, res)
            })
            .catch(() => {})
        )
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // v27.6.4.2 migration — the prior SW used a single CACHE_NAME
  // (e.g. bitebook-v27.6.4.1) that bumped per release; activating
  // a new SW nuked all old caches, destroying the user's cached
  // navigations. To migrate gracefully we (a) copy navigation /
  // dynamic entries from any old bitebook-* cache into the new
  // RUNTIME_CACHE, then (b) delete the old caches. The current
  // SHELL_CACHE and RUNTIME_CACHE are explicitly preserved.
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const runtime = await caches.open(RUNTIME_CACHE)

    for (const key of keys) {
      if (key === SHELL_CACHE || key === RUNTIME_CACHE) continue
      if (!key.startsWith('bitebook-')) continue

      try {
        const oldCache = await caches.open(key)
        const oldRequests = await oldCache.keys()
        for (const req of oldRequests) {
          let url
          try { url = new URL(req.url) } catch { continue }
          // Skip pure shell assets — the new SHELL_CACHE will
          // re-fetch its own copies. We only want to preserve
          // navigation HTML and dynamic data.
          if (
            url.pathname.startsWith('/_next/static/') ||
            /\.(?:png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|ico)$/i.test(url.pathname) ||
            url.pathname === '/manifest.webmanifest' ||
            url.pathname === '/offline.html'
          ) continue
          try {
            const res = await oldCache.match(req)
            if (res) await runtime.put(req, res.clone())
          } catch {}
        }
      } catch {}

      try { await caches.delete(key) } catch {}
    }

    await self.clients.claim()
  })())
})

// ── Helpers ──────────────────────────────────────────────────────

// Fire-and-forget cache write. Clones the response synchronously
// BEFORE any await so the original body isn't consumed by the time
// the page reads it. Filters to same-origin successful GETs — opaque
// / redirected / error / mutation responses must not be cached.
function cachePutInto(cacheName, request, response) {
  if (request.method !== 'GET') return
  if (!response || !response.ok || response.type !== 'basic') return
  if (response.status !== 200) return
  let clone
  try {
    clone = response.clone()
  } catch {
    return
  }
  caches
    .open(cacheName)
    .then((cache) => cache.put(request, clone))
    .catch(() => {})
}

// Navigation requests (HTML pages). Network-first so the freshest UI
// wins online; offline path waterfalls: this exact URL → '/' → pre-
// cached /offline.html → synthetic. Stores into RUNTIME_CACHE so the
// page survives release cache-name bumps.
async function handleNavigation(request) {
  try {
    const networkRes = await fetch(request)
    cachePutInto(RUNTIME_CACHE, request, networkRes)
    return networkRes
  } catch {
    // caches.match without a cacheName argument searches across all
    // open caches (shell + runtime). That's exactly what we want: a
    // page might live in either.
    const exact = await caches.match(request)
    if (exact) return exact
    const home = await caches.match('/')
    if (home) return home
    const offline = await caches.match('/offline.html')
    if (offline) return offline
    return syntheticOfflineHTML()
  }
}

// Static-asset cache-first (Next.js content-hashed bundles, fonts,
// icons, etc.). Stored in SHELL_CACHE because they're version-tied —
// when the deploy bumps and old hashed bundles are no longer
// referenced, nuking the old shell cache reclaims their disk space.
async function handleCacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const networkRes = await fetch(request)
    cachePutInto(SHELL_CACHE, request, networkRes)
    return networkRes
  } catch {
    return syntheticOfflineGeneric()
  }
}

// Network-first for everything else (dynamic JSON, /_next/data, etc).
// Stored in RUNTIME_CACHE so partial app data survives across releases.
async function handleNetworkFirst(request) {
  try {
    const networkRes = await fetch(request)
    cachePutInto(RUNTIME_CACHE, request, networkRes)
    return networkRes
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return syntheticOfflineGeneric()
  }
}

// ── Fetch handler ────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Hands-off list — these MUST hit the network or fail naturally.
  // SW interception of API/auth/analytics traffic causes more bugs
  // than it solves: cookie handling, CORS preflights, and streaming
  // responses all break in subtle ways.
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('stripe') ||
    url.hostname.includes('posthog') ||
    url.hostname.includes('anthropic') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  // Only intercept GET. POSTs (form submissions, server actions),
  // PUT/PATCH/DELETE — caching mutations is dangerous and replaying
  // a cached POST response on retry is a bug.
  if (request.method !== 'GET') return

  const accept = request.headers.get('accept') || ''
  const isNavigation = request.mode === 'navigate' || accept.includes('text/html')

  if (isNavigation) {
    event.respondWith(handleNavigation(request))
    return
  }

  // Cache-first for shell static assets, Next.js content-hashed
  // bundles, and common image / font extensions.
  if (
    PRECACHE_URLS.includes(url.pathname) ||
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(handleCacheFirst(request))
    return
  }

  // Network-first for everything else (dynamic data, _next/data,
  // Supabase Storage signed URLs the page references).
  event.respondWith(handleNetworkFirst(request))
})

// Background Sync for offline outbox.
self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'SYNC_OUTBOX' }))
    }))
  }
})

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Bite Book', {
      body: data.body ?? '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: data.url ? { url: data.url } : undefined,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url === url)
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
