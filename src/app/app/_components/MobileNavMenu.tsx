'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import MobileNavDrawer, { type MobileNavDrawerItem } from './MobileNavDrawer'

// v26.1: client wrapper around the hamburger trigger button + the drawer
// state. Letting AppHeader / HunterAppHeader stay server-rendered means the
// brand mark and primary tabs paint without needing the client bundle, and
// only the trigger + drawer are hydrated.

type Props = {
  items: ReadonlyArray<MobileNavDrawerItem>
  children?: ReactNode
  className?: string
}

export default function MobileNavMenu({ items, children, className }: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`bb-hamburger${className ? ` ${className}` : ''}`}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      <MobileNavDrawer
        isOpen={open}
        onClose={() => {
          setOpen(false)
          // Return focus to the hamburger trigger so screen readers + keyboard
          // users land back where they invoked the drawer.
          window.setTimeout(() => buttonRef.current?.focus(), 0)
        }}
        items={items}
      >
        {children}
      </MobileNavDrawer>
    </>
  )
}
