'use client'

import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

// v27.8.2 — share-by-link affordance on each pending invite row.
// Builds the same /accept-invite?token=... URL the email contains and
// copies it to clipboard so the guide can paste it into a text,
// WhatsApp, etc. — Flavio: "guides who want to invite by link instead
// of email." Token URL is stable until the invite is accepted /
// canceled / expires; copying doesn't change any state.
//
// Future v27.8.3 will introduce a true "no email" link-mode invite via
// schema work (nullable email + kind column). This minimal pass
// surfaces the existing token without any DB migration.
export default function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/accept-invite?token=${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback for browsers without clipboard API access.
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {}
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="bb-text-action bb-text-action-copper"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontSize: '0.78rem',
      }}
      aria-label={copied ? 'Link copied' : 'Copy invite link'}
    >
      {copied ? (
        <>
          <Check size={14} aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Link2 size={14} aria-hidden="true" />
          Copy link
        </>
      )}
    </button>
  )
}
