'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, Wallet, Star, Network } from 'lucide-react'

// v26.1: primary mobile nav with overflow items in the hamburger drawer.
// v27.0a: Wallet added between Hunters and Reviews — 5 tabs total.
// v28.1.0e.1: outfitter members get a Network tab in place of the
// standalone Hunters tab. Solo guides keep Hunters as their own tab.
const TABS_GUIDE = [
  { href: '/app',         label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',   label: 'Trips',     Icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/hunters', label: 'Hunters',   Icon: Users,           match: (p: string) => p.startsWith('/app/hunters') },
  { href: '/app/wallet',  label: 'Wallet',    Icon: Wallet,          match: (p: string) => p.startsWith('/app/wallet') },
  { href: '/app/reviews', label: 'Reviews',   Icon: Star,            match: (p: string) => p.startsWith('/app/reviews') },
] as const

const TABS_OUTFITTER = [
  { href: '/app',         label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',   label: 'Trips',     Icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/network', label: 'Network',   Icon: Network,         match: (p: string) => p.startsWith('/app/network') || p.startsWith('/app/hunters') },
  { href: '/app/wallet',  label: 'Wallet',    Icon: Wallet,          match: (p: string) => p.startsWith('/app/wallet') },
  { href: '/app/reviews', label: 'Reviews',   Icon: Star,            match: (p: string) => p.startsWith('/app/reviews') },
] as const

// v25.1: redesigned mobile nav. Each tab is a vertical stack (icon over
// label) with equal flex sizing, a copper underline on the active tab, and
// a touch target that clears 44px. Labels are always visible at every
// breakpoint to avoid the icon-only ambiguity hunters reported in v24.
export default function AppNav({ isOutfitterMember = false }: { isOutfitterMember?: boolean }) {
  const pathname = usePathname() ?? ''
  const TABS = isOutfitterMember ? TABS_OUTFITTER : TABS_GUIDE
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
