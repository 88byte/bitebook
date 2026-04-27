'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Force a SW update check on every page load. Without this, installed
    // PWAs (especially iOS) only check for new SW versions on the browser's
    // own heuristic schedule — which can leave a phone running stale shell
    // assets for hours after a release.
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {})

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // If the page got controlled by a different SW than expected, reload once.
        // Avoids a known PWA bug where the first visit after an SW update keeps
        // the old shell. We use sessionStorage to break the loop.
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch((err) => console.error('SW registration failed:', err))

    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  }, [])

  return null
}
