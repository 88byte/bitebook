'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, Wallet, Star, FileText, Settings, LifeBuoy, Network } from 'lucide-react'
import SignOutButton from './SignOutButton'
import ConnectivityDot from '@/app/_components/ConnectivityDot'

// Desktop-only sidebar. Hidden under 1024px via .bb-sidebar CSS.
// v27.0a: Wallet added between Hunters and Reviews.
// v28.1.0e.0: Network item gated to outfitter members. Solo guides
// don't see it. The page itself also self-gates with a friendly
// "not active for you" message if a solo guide deep-links to it.
const NAV_BASE = [
  { href: '/app',          label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',    label: 'Trips',     icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/hunters',  label: 'Hunters',   icon: Users,           match: (p: string) => p.startsWith('/app/hunters') },
  { href: '/app/wallet',   label: 'Wallet',    icon: Wallet,          match: (p: string) => p.startsWith('/app/wallet') },
  { href: '/app/reviews',  label: 'Reviews',   icon: Star,            match: (p: string) => p.startsWith('/app/reviews') },
  { href: '/app/docs',     label: 'Documents', icon: FileText,        match: (p: string) => p.startsWith('/app/docs') },
  { href: '/app/settings', label: 'Settings',  icon: Settings,        match: (p: string) => p.startsWith('/app/settings') },
  { href: '/app/support',  label: 'Help',      icon: LifeBuoy,        match: (p: string) => p.startsWith('/app/support') },
] as const

const NAV_NETWORK_ITEM = {
  href: '/app/network',
  label: 'Network',
  icon: Network,
  match: (p: string) => p.startsWith('/app/network'),
} as const

// v27.8.1 — ADMIN pill removed per Flavio. Email-match admin gate
// stays in proxy.ts; admin emails reach Mission Control by typing
// /admin directly. The pill was visual clutter on every render.
export default function Sidebar({ isOutfitterMember = false }: { isOutfitterMember?: boolean }) {
  const pathname = usePathname() ?? ''
  // Insert Network between Hunters and Wallet for outfitter members.
  const NAV = isOutfitterMember
    ? [
        ...NAV_BASE.slice(0, 3),
        NAV_NETWORK_ITEM,
        ...NAV_BASE.slice(3),
      ]
    : NAV_BASE
  return (
    <aside className="bb-sidebar" aria-label="Primary navigation">
      <Link href="/app" className="bb-sidebar-brand" aria-label="Bite Book home">
        <Image
          src="/bb-logo-mark.png"
          alt=""
          width={1024}
          height={1024}
          sizes="32px"
          className="h-8 w-8"
          priority
        />
        <span className="bb-sidebar-brand-text">Bite Book</span>
      </Link>

      <nav className="bb-sidebar-nav">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={`bb-sidebar-link ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="bb-sidebar-foot">
        {/* v27.7.0 — small labeled dot in the sidebar foot, above Sign out.
            Variant 'labeled' renders the dot + uppercase status text so the
            desktop affordance is more discoverable than the inline header dot. */}
        <ConnectivityDot variant="labeled" />
        <SignOutButton />
      </div>
    </aside>
  )
}
