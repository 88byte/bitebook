'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, FileText, Settings } from 'lucide-react'

const TABS = [
  { href: '/app',          label: 'Dashboard', Icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',    label: 'Trips',     Icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/hunters',  label: 'Hunters',   Icon: Users,           match: (p: string) => p.startsWith('/app/hunters') },
  { href: '/app/docs',     label: 'Docs',      Icon: FileText,        match: (p: string) => p.startsWith('/app/docs') },
  { href: '/app/settings', label: 'Settings',  Icon: Settings,        match: (p: string) => p.startsWith('/app/settings') },
] as const

// Mobile primary nav (shown inside AppHeader on <1024px viewports). Desktop
// uses Sidebar instead and AppHeader is hidden via .bb-app-mobile-header.
// 5 tabs fit by hiding the text label below 640px (icon-only) and showing
// icon+label from sm: up.
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
            <Icon size={16} aria-hidden="true" />
            <span className="bb-app-nav-label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
