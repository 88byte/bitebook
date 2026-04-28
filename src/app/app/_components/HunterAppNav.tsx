'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, User } from 'lucide-react'

// v25.1: mobile primary nav for hunters. Mirrors AppNav (icon-over-label
// columns, copper underline on active) but with the 3 hunter-only routes.
//
// v26.3: Guides added as a 4th tab (between My trips and Profile). The
// existing CSS uses flex:1 per tab, so 4 tabs at ~94px each still fit a
// 375px viewport with the brand minus 24px of horizontal padding.
const TABS = [
  { href: '/app/h',          label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/app/h' },
  { href: '/app/h/trips',    label: 'My trips',  Icon: Calendar,        match: (p: string) => p.startsWith('/app/h/trips') },
  { href: '/app/h/guides',   label: 'Guides',    Icon: Users,           match: (p: string) => p.startsWith('/app/h/guides') },
  { href: '/app/h/profile',  label: 'Profile',   Icon: User,            match: (p: string) => p.startsWith('/app/h/profile') },
] as const

export default function HunterAppNav() {
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
