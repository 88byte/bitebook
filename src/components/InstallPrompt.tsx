'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('install-dismissed')) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSSafari = isIOS && !isInStandalone && !(navigator as unknown as Record<string, unknown>)['standalone']

    if (isIOSSafari) {
      setShowIOS(true)
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
    setShowIOS(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDismissed(true)
    setDeferredPrompt(null)
  }

  if (dismissed) return null

  if (deferredPrompt) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="rounded-2xl bg-paper border border-accent/20 shadow-lg p-4 flex items-center gap-3 max-w-sm mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192x192.png" alt="" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-ink text-sm font-bold leading-tight">Add Bite Book to your home screen</p>
            <p className="text-ink/60 text-xs mt-0.5">Works offline · Fast access</p>
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

  if (showIOS) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="rounded-2xl bg-paper border border-accent/20 shadow-lg p-4 max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192x192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
            <p className="font-display text-ink text-sm font-bold leading-tight">Add Bite Book to your home screen</p>
            <button onClick={handleDismiss} className="ml-auto text-ink/40 text-lg leading-none p-1">×</button>
          </div>
          <p className="text-ink/70 text-xs leading-relaxed">
            Tap{' '}
            <span className="inline-block align-middle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </span>{' '}
            then <strong>"Add to Home Screen"</strong> for the best offline experience.
          </p>
        </div>
      </div>
    )
  }

  return null
}
