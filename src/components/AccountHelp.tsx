import Image from 'next/image'
import Link from 'next/link'
import { HelpCircle, UserPlus } from 'lucide-react'

// Footer block beneath the LoginForm: account-help divider, two side-by-side
// helper links (Forgot password / Create guide account), and the dark hunter
// callout card with the shield image. Used on / and /login.
export default function AccountHelp() {
  return (
    <>
      <div className="bb-divider">Account help</div>

      <div className="bb-help-grid">
        <Link href="/forgot-password" className="bb-help-link">
          <HelpCircle size={18} aria-hidden="true" />
          Forgot password?
        </Link>
        <Link href="/signup" className="bb-help-link">
          <UserPlus size={18} aria-hidden="true" />
          Create guide account
        </Link>
      </div>

      <div className="bb-callout">
        <Image
          src="/bb-shield.png"
          alt=""
          width={200}
          height={200}
          sizes="44px"
          className="h-11 w-11 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="bb-callout-text">
          <span className="bb-callout-title">Hunters: Bite Book is invite-only.</span>
          <span>Ask your guide for an invite.</span>
        </div>
      </div>
    </>
  )
}
