// v27.6.4 — full offline rewrite. Flavio reported on his phone PWA
// in airplane mode: "Safari can't open the page. The error was:
// FetchEvent.respondWith received an error: Returned response is null."
// Three bugs in the prior handler each produced an undefined / rejected
// Response:
//   1. Navigation .catch resolved `cached ?? caches.match(request)` —
//      when both missed, respondWith got undefined.
//   2. Static-asset cache-first nested fetch().then(...) had no .catch;
//      a network failure rejected the chain unwrapped to respondWith.
//   3. Generic fallback `fetch.catch(() => caches.match(request))` also
//      resolved to undefined when both legs missed.
// New strategy: every respondWith is fed by a helper that ALWAYS resolves
// to a real Response — falling through to a pre-cached /offline.html, and
// finally to a synthetic 503 if even that's missing. This guarantees the
// PWA never crashes the SW boundary, regardless of cache state.
//
// Cache name still bumps per release so installed PWAs nuke stale shells
// on activate. Offline mode is now a real, audited path — not just the
// shell-cache side-effect it accidentally was.

const CACHE_NAME = 'bitebook-v27.6.4.1'

// Pre-cache list. /offline.html is the universal fallback for navigation
// requests; the others are static shell assets that never change between
// deploys (or are content-hashed by Next at /_next/static/…). Putting
// them in cache at install means first-paint while offline still has
// fonts + icons.
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/bb-logo.png',
]

// Synthetic last-resort responses. Used only when even the pre-cached
// /offline.html is missing (e.g. install completed online but cache was
// evicted). Returning a real Response object keeps respondWith from
// rejecting and triggering Safari's "Returned response is null" error.
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
    caches.open(CACHE_NAME).then((cache) =>
      // Use individual put()s wrapped in a no-throw block so a single
      // missing asset doesn't fail the entire install. addAll() is
      // all-or-nothing; we want best-effort precache here.
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
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Helpers ──────────────────────────────────────────────────────

// Fire-and-forget cache write. Clones the response synchronously BEFORE
// any await so the original body isn't consumed by the time the user's
// page reads it. Filters to same-origin successful GETs — opaque /
// redirected / error / mutation responses must not be cached.
function cachePut(request, response) {
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
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, clone))
    .catch(() => {})
}

// Navigation requests (HTML pages). Network-first so the freshest UI
// wins online. Offline path waterfalls: this exact URL → '/' → pre-
// cached /offline.html → synthetic. Every leg is awaited so the final
// returned value is always a real Response.
async function handleNavigation(request) {
  try {
    const networkRes = await fetch(request)
    cachePut(request, networkRes)
    return networkRes
  } catch {
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
// icons, etc.). Cache hit is always safe because the URL itself
// changes when the asset changes. Falls through to a synthetic 504
// rather than rejecting the response.
async function handleCacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const networkRes = await fetch(request)
    cachePut(request, networkRes)
    return networkRes
  } catch {
    return syntheticOfflineGeneric()
  }
}

// Network-first for everything else (dynamic JSON, /_next/data,
// images that aren't pre-cached). Tries network, falls back to any
// cached copy, then synthetic. Never rejects.
async function handleNetworkFirst(request) {
  try {
    const networkRes = await fetch(request)
    cachePut(request, networkRes)
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
  // responses all break in subtle ways. The browser's native
  // network-error UI is a better experience for these than a
  // synthetic offline page.
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

// Background Sync for offline outbox. Same shape as before — when
// the browser fires a sync event, broadcast to all open clients so
// the React layer can flush its queued writes.
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
