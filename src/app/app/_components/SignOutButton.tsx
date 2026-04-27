'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  return (
    <button
      type="button"
      className="bb-app-signout"
      onClick={signOut}
      disabled={pending}
      aria-label="Sign out"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
