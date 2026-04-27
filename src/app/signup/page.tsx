import Link from 'next/link'
import SignupForm from './SignupForm'
import DarkHero from '@/components/DarkHero'
import Footer from '@/components/Footer'

export const metadata = { title: 'Start your free trial — Bite Book' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>
}) {
  const { canceled } = await searchParams

  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero tagline={<p className="bb-tagline-static">Start your trial.</p>} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-md bb-fade-up" style={{ animationDelay: '0.15s' }}>
          <h1 className="text-center text-3xl mb-1" style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}>
            7 days free. No card required.
          </h1>
          <p className="text-center text-xs mb-5" style={{ color: 'var(--color-ink)', opacity: 0.65 }}>
            Keep track of hunts. Stay ready for the warden.
          </p>
          {canceled && (
            <p className="mb-3 text-xs text-center rounded-lg px-3 py-2" style={{ background: '#fff7ed', color: '#9a3412' }}>
              Checkout canceled. You can try again whenever you&rsquo;re ready.
            </p>
          )}
          <SignupForm />
          <p className="mt-4 text-center text-xs" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
            Already have an account?{' '}
            <Link href="/login" className="underline" style={{ color: 'var(--color-accent)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
