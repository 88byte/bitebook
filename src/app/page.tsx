import LoginForm from './login/LoginForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import AccountHelp from '@/components/AccountHelp'
import Footer from '@/components/Footer'

// Same error-code copy used by /login. Mirrored here because requireGuide()
// redirects to "/" with ?error= when role/profile checks fail (sending to
// /login would loop). Without this banner those users would land on the
// landing page with no explanation of why they got bounced from /app.
const ERROR_COPY: Record<string, string> = {
  no_profile: 'Your account is missing its profile record. Sign in again, or email support@lastbite.pro if this persists.',
  guide_only: 'The /app area is for guide accounts. Your account is set up as a hunter — ask your guide to invite you to a trip.',
  hunter_only: 'The hunter area is for hunter accounts. Sign in with the account that received the invite.',
  profile_unavailable: 'We couldn’t load your profile. Try signing in again, or email support@lastbite.pro.',
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const banner = error ? (ERROR_COPY[error] ?? null) : null

  return (
    <main className="flex flex-col min-h-screen">
      <Hero
        taglineLine1="Track every hunt."
        taglineLine2="Build your history."
        subtitle="Log harvests, preserve field details, and organize your hunts in one place."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Sign in">
          {banner && (
            <p
              role="alert"
              className="mb-3 rounded-lg px-3 py-2 text-xs text-center"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
            >
              {banner}
            </p>
          )}
          <LoginForm />
          <AccountHelp />
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
