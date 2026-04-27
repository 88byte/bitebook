import Link from 'next/link'
import ResetPasswordForm from './ResetPasswordForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import Footer from '@/components/Footer'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Set new password — Bite Book' }

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <Hero
        taglineLine1="Set a new password."
        subtitle="Pick something strong. We&rsquo;ll keep you signed in after."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="New password">
          {!user ? (
            <p className="text-center text-xs" style={{ color: '#dc2626' }}>
              This reset link expired or was already used.{' '}
              <Link href="/forgot-password" className="underline">Request a new one</Link>.
            </p>
          ) : (
            <>
              <p className="text-center text-xs mb-4" style={{ color: 'var(--color-ink-muted)' }}>
                Choose a strong password for <strong>{user.email}</strong>.
              </p>
              <ResetPasswordForm />
            </>
          )}
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
