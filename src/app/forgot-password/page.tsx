import Link from 'next/link'
import ForgotPasswordForm from './ForgotPasswordForm'
import DarkHero from '@/components/DarkHero'
import Footer from '@/components/Footer'

export const metadata = { title: 'Reset password — Bite Book' }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero tagline={<p className="bb-tagline-static">Reset your password.</p>} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.15s' }}>
          <h1 className="text-center text-2xl mb-1" style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}>
            Forgot your password?
          </h1>
          <p className="text-center text-xs mb-5" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
            We&rsquo;ll email you a link to set a new one.
          </p>
          <ForgotPasswordForm initialEmail={email} />
          <p className="mt-4 text-center text-xs">
            <Link href="/login" className="underline" style={{ color: 'var(--color-accent)' }}>
              Back to sign in
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
