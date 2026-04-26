import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 min-h-screen"
      style={{ background: 'var(--color-paper)' }}
    >
      <h1
        className="text-3xl font-bold"
        style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
      >
        Welcome to Bite Book
      </h1>
      <p className="text-sm" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
        Signed in as {user.email}
      </p>
    </main>
  )
}
