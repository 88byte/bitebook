import Link from 'next/link'
import ResetPasswordForm from './ResetPasswordForm'
import DarkHero from '@/components/DarkHero'
import Footer from '@/components/Footer'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Set new password — Bite Book' }

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero backgroundWord="RESET" tagline={<p className="bb-tagline-static">Set a new password.</p>} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.15s' }}>
          {!user ? (
            <p className="text-center text-xs" style={{ color: '#dc2626' }}>
              This reset link expired or was already used.{' '}
              <Link href="/forgot-password" className="underline">Request a new one</Link>.
            </p>
          ) : (
            <>
              <p className="text-center text-xs mb-5" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
                Choose a strong password for <strong>{user.email}</strong>.
              </p>
              <ResetPasswordForm />
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
