'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/app', label: 'Today', match: (p: string) => p === '/app' },
  { href: '/app/trips', label: 'Trips', match: (p: string) => p.startsWith('/app/trips') },
] as const

export default function AppNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="bb-app-nav" aria-label="Primary">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={tab.match(pathname) ? 'is-active' : ''}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
