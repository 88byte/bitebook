import Link from 'next/link'
import ForgotPasswordForm from './ForgotPasswordForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
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
      <Hero
        taglineLine1="Reset your password."
        subtitle="We&rsquo;ll email you a link to set a new one."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Reset password">
          <ForgotPasswordForm initialEmail={email} />
          <p className="mt-4 text-center text-xs">
            <Link href="/login" className="underline" style={{ color: 'var(--color-copper)' }}>
              Back to sign in
            </Link>
          </p>
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
