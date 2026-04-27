'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// When a Supabase password-recovery email link is clicked, the user lands
// somewhere on the site (depending on email-template config) and Supabase
// fires a PASSWORD_RECOVERY auth event. This handler listens globally and
// routes those users to /reset-password regardless of where they land.
// This is the canonical Supabase pattern — it makes the reset flow robust
// to email-template changes (which are managed outside this codebase).
export default function RecoveryHandler() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && pathname !== '/reset-password') {
        router.replace('/reset-password')
      }
    })
    return () => subscription.unsubscribe()
  }, [router, pathname])

  return null
}
