'use client'

// v27.7.0 — small client hook tracking online/offline state. Reads
// `navigator.onLine` once on mount, then keeps in sync via the window
// online/offline events. Returns true SSR-side (default-to-online) so
// the first server-rendered HTML doesn't flash a misleading offline
// state for users who actually have a connection.
//
// Used by ConnectivityDot in the app headers. Subsequent ships
// (v27.7.0.1+) will consume it from the precache trigger and the
// outbox sync worker too.

import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(true)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setOnline(navigator.onLine)
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}
