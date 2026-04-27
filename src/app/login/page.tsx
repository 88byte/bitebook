import LoginForm from './LoginForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import AccountHelp from '@/components/AccountHelp'
import Footer from '@/components/Footer'

export const metadata = { title: 'Sign In — Bite Book' }

// Banner copy for known error codes that can land us back on /login. Anything
// not listed gets a generic "we couldn't keep you signed in" so users see
// SOMETHING instead of a silent re-render.
const ERROR_COPY: Record<string, string> = {
  auth_failed: 'That sign-in link expired or was already used. Please sign in below.',
  no_profile: 'Your account is missing its profile record. Please sign in again — if this persists, email support@lastbite.pro.',
  guide_only: 'This area is for guide accounts. Sign in with your guide email.',
  profile_unavailable: 'We couldn’t load your profile. Sign in again, or email support@lastbite.pro if it keeps happening.',
  loop: 'We bumped you back to sign-in after a redirect issue. Please try again.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const banner = error ? (ERROR_COPY[error] ?? 'Sign in failed. Please try again or email support@lastbite.pro.') : null

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
          <LoginForm next={next} initialError={null} />
          <AccountHelp />
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
