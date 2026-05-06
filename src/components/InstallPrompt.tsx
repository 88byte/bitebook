'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type IOSMode = 'safari' | 'other-browser' | null

// v27.8.0 — suppress on public marketing routes. Install prompts that
// hijack the bottom of the screen kill marketing-page scroll engagement
// and bury the CTA. The PWA offer surfaces ONLY after a visitor has
// chosen to engage (login / signup / authed app).
const SUPPRESS_PREFIXES: ReadonlyArray<string> = [
  '/welcome',
  '/welcome-preview',
]

function isMarketingPath(p: string | null | undefined): boolean {
  if (!p) return false
  return SUPPRESS_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

export default function InstallPrompt() {
  const pathname = usePathname()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosMode, setIosMode] = useState<IOSMode>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('install-dismissed')) return
    if (isMarketingPath(pathname)) return

    const ua = navigator.userAgent
    const nav = navigator as Navigator & { standalone?: boolean; maxTouchPoints?: number }

    // iPadOS 13+ reports a Mac UA — detect via multi-touch.
    const isIOSDevice =
      /iphone|ipad|ipod/i.test(ua) ||
      (ua.includes('Macintosh') && (nav.maxTouchPoints ?? 0) > 1)

    const isInStandalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true

    if (isIOSDevice && !isInStandalone) {
      const isNonSafariBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|FBAN|FBAV|FB_IAB|Instagram|Line|Twitter|GSA/i.test(ua)
      const isSafari = ua.includes('Safari') && !isNonSafariBrowser
      setIosMode(isSafari ? 'safari' : 'other-browser')
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleDismiss = () => {
    sessionStorage.setItem('install-dismissed', '1')
    setDismissed(true)
    setDeferredPrompt(null)
    setIosMode(null)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDismissed(true)
    setDeferredPrompt(null)
  }

  if (dismissed) return null
  // v27.8.0 — bulletproof: even if state somehow leaks across pathname
  // changes, never render on marketing paths.
  if (isMarketingPath(pathname)) return null

  // Chrome / Edge / Android — native beforeinstallprompt flow
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="rounded-2xl bg-paper border border-accent/20 shadow-lg p-4 flex items-center gap-3 max-w-sm mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192x192.png" alt="" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-ink text-sm font-bold leading-tight">Install Bite Book</p>
            <p className="text-ink/60 text-xs mt-0.5">Works offline · One tap to open</p>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={handleInstall}
              className="rounded-full bg-accent text-paper text-xs font-bold px-3 py-1.5 leading-none"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-full text-ink/40 text-xs px-3 py-1.5 leading-none"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    )
  }

  // iOS Safari — walk through Share → Add to Home Screen
  if (iosMode === 'safari') {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="rounded-2xl bg-paper border border-accent/20 shadow-lg p-4 max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192x192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
            <p className="font-display text-ink text-sm font-bold leading-tight">Add Bite Book to your home screen</p>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="ml-auto text-ink/40 leading-none p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-ink/70 text-xs leading-relaxed">
            On iPhone or iPad: tap the Share button{' '}
            <span className="inline-block align-middle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </span>{' '}
            then <strong>&ldquo;Add to Home Screen.&rdquo;</strong> Heads up: this only works in Safari — not Chrome or in-app browsers.
          </p>
        </div>
      </div>
    )
  }

  // iOS but the user is in Chrome iOS / Firefox iOS / a webview — they have to switch to Safari first
  if (iosMode === 'other-browser') {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="rounded-2xl bg-paper border border-accent/20 shadow-lg p-4 max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192x192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
            <p className="font-display text-ink text-sm font-bold leading-tight">Open in Safari to install</p>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="ml-auto text-ink/40 leading-none p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-ink/70 text-xs leading-relaxed">
            On iPhone and iPad, adding Bite Book to your home screen only works in <strong>Safari</strong>. Open this page in Safari, tap the Share button, then choose <strong>&ldquo;Add to Home Screen.&rdquo;</strong>
          </p>
        </div>
      </div>
    )
  }

  return null
}
