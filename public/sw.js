// v27.2.0.3.5 — bump CACHE_NAME on every release. The activate
// handler nukes any cache whose name doesn't match, forcing a clean
// fetch of all shell assets the next time they're requested. This
// is the recurring stale-PWA-cache fix Flavio's been bitten by:
// without a per-deploy bump, the SW bytes don't change, the browser
// doesn't re-install, and the activate-time cache nuke never fires.
const CACHE_NAME = 'bitebook-v27.3.2'
// HTML pages (incl. '/') are served network-first so updates always show up when online.
// Only static assets sit in the cache-first shell list.
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/bb-logo.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept Supabase API, auth, or analytics calls
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('stripe') ||
    url.hostname.includes('posthog') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')

  // Network-first for navigations so the freshest HTML wins, with cache fallback offline.
  // We cache the landing page ('/') as the offline fallback for any navigation request.
  if (isNavigation) {
    event.respondWith(
      fetch(request).then((res) => {
        if (url.pathname === '/' && res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put('/', clone))
        }
        return res
      }).catch(() => caches.match('/').then((cached) => cached ?? caches.match(request)))
    )
    return
  }

  // Cache-first for shell static assets; network-first for everything else.
  if (SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        return res
      }))
    )
  } else {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    )
  }
})

// Background Sync for offline outbox
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
