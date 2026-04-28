'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, Star, Settings } from 'lucide-react'

// v26.0 Batch A: dropped "Docs" from mobile bottom-nav to make room for
// "Reviews" without crushing tap targets at 360px. Docs is still reachable
// from the desktop sidebar AND from the dashboard "Documents" widget on
// mobile, so the route is not orphaned. If we add a 6th primary entry
// later, the right move is a hamburger drawer rather than further
// tightening per-tab padding.
const TABS = [
  { href: '/app',          label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',    label: 'Trips',     Icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/hunters',  label: 'Hunters',   Icon: Users,           match: (p: string) => p.startsWith('/app/hunters') },
  { href: '/app/reviews',  label: 'Reviews',   Icon: Star,            match: (p: string) => p.startsWith('/app/reviews') },
  { href: '/app/settings', label: 'Settings',  Icon: Settings,        match: (p: string) => p.startsWith('/app/settings') },
] as const

// v25.1: redesigned mobile nav. Each tab is now a vertical stack (icon over
// label) with equal flex sizing, a copper underline on the active tab, and
// a touch target that clears 44px. Labels are always visible at every
// breakpoint to avoid the icon-only ambiguity hunters reported in v24.
export default function AppNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="bb-app-nav" aria-label="Primary">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            className={active ? 'is-active' : ''}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} aria-hidden="true" />
            <span className="bb-app-nav-label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
