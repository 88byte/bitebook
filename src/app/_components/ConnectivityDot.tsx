'use client'

// v27.7.0 — small visible cue for online/offline status. Drops into
// AppHeader, HunterAppHeader (mobile), and Sidebar / HunterSidebar
// (desktop). Default-to-online during SSR via useOnlineStatus so the
// first paint doesn't flash a stale offline state.
//
// Visual: 8px dot. Online = active green (#6A9859), offline = ink-soft
// gray (#8A8378). Red is reserved for errors — being offline isn't an
// error, it's a state. tooltip + aria-label communicate the current
// state for accessibility.

import { useOnlineStatus } from '@/lib/offline/hooks/useOnlineStatus'

const ONLINE_COLOR = '#6A9859'
const OFFLINE_COLOR = '#8A8378'

export default function ConnectivityDot({
  variant = 'inline',
}: {
  /**
   * 'inline'  — small dot, no label. Used in mobile header.
   * 'labeled' — dot + small text. Used in desktop sidebar foot.
   */
  variant?: 'inline' | 'labeled'
}) {
  const online = useOnlineStatus()
  const color = online ? ONLINE_COLOR : OFFLINE_COLOR
  const label = online ? 'Online' : 'Offline'

  if (variant === 'labeled') {
    return (
      <span
        role="status"
        aria-label={label}
        title={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.7rem',
          color: 'rgba(244, 239, 229, 0.55)',
          fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '999px',
            background: color,
            boxShadow: online ? `0 0 0 2px rgba(106, 152, 89, 0.18)` : 'none',
            transition: 'background 120ms, box-shadow 120ms',
          }}
        />
        {label}
      </span>
    )
  }

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '999px',
          background: color,
          boxShadow: online ? `0 0 0 2px rgba(106, 152, 89, 0.18)` : 'none',
          transition: 'background 120ms, box-shadow 120ms',
        }}
      />
    </span>
  )
}
