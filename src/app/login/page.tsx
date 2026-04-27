import LoginForm from './LoginForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import AccountHelp from '@/components/AccountHelp'
import Footer from '@/components/Footer'

export const metadata = { title: 'Sign In — Bite Book' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <main className="flex flex-col min-h-screen">
      <Hero
        taglineLine1="Track every hunt."
        taglineLine2="Build your history."
        subtitle="Log harvests, preserve field details, and organize your hunts in one place."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Sign in">
          {error === 'auth_failed' && (
            <p className="mb-3 rounded-lg px-3 py-2 text-xs text-center" style={{ background: '#fef2f2', color: '#dc2626' }}>
              That sign-in link expired or was already used. Please try again.
            </p>
          )}
          <LoginForm next={next} />
          <AccountHelp />
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
