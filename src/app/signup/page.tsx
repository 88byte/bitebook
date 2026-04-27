import Link from 'next/link'
import SignupForm from './SignupForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
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
      <Hero
        taglineLine1="Start your trial."
        subtitle="7 days free. No card required. Built with guides."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Get started">
          {canceled && (
            <p className="mb-3 text-xs text-center rounded-lg px-3 py-2" style={{ background: '#fff7ed', color: '#9a3412' }}>
              Checkout canceled. You can try again whenever you&rsquo;re ready.
            </p>
          )}
          <SignupForm />
          <p className="mt-4 text-center text-xs" style={{ color: 'var(--color-ink-muted)' }}>
            Already have an account?{' '}
            <Link href="/login" className="underline font-semibold" style={{ color: 'var(--color-copper)' }}>
              Sign in
            </Link>
          </p>
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
