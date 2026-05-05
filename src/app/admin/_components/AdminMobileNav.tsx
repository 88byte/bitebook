'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users2, BarChart3, UserCircle2 } from 'lucide-react'

// v27.6.0.1 / v27.6.1 — Mobile-only horizontal nav for /admin. The
// AdminSidebar is desktop-only (.bb-sidebar { display: none } under
// 1024px) and the AdminMobileHeader carries just brand + back-to-app,
// so on mobile there was no path between live sections. This strip
// fills that gap. Hidden at >=1024px via .bb-admin-mobile-nav CSS.
//
// v27.6.1 — Hunters promoted from stub to live, "Accounts" renamed
// to "Guides". Stubs (Discounts/Templates/Activity) intentionally
// not surfaced here — mobile real-estate goes to live sections.
const MOBILE_NAV = [
  { href: '/admin',         label: 'Guides',  icon: Users2,      match: (p: string) => p === '/admin' || p.startsWith('/admin/guides') },
  { href: '/admin/hunters', label: 'Hunters', icon: UserCircle2, match: (p: string) => p.startsWith('/admin/hunters') },
  { href: '/admin/revenue', label: 'Revenue', icon: BarChart3,   match: (p: string) => p.startsWith('/admin/revenue') },
] as const

export default function AdminMobileNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav className="bb-admin-mobile-nav" aria-label="Mission Control sections">
      {MOBILE_NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`bb-admin-mobile-nav-link ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
