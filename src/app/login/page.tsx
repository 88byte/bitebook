import LoginForm, { GuideSignupNote, HuntersInviteOnlyNote } from './LoginForm'
import DarkHero from '@/components/DarkHero'
import RotatingTagline from '@/components/RotatingTagline'
import Footer from '@/components/Footer'

export const metadata = { title: 'Sign In — Bite Book' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero backgroundWord="FIELD" tagline={<RotatingTagline />} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.15s' }}>
          {error === 'auth_failed' && (
            <p className="mb-3 rounded-lg px-3 py-2 text-xs text-center" style={{ background: '#fef2f2', color: '#dc2626' }}>
              That sign-in link expired or was already used. Please try again.
            </p>
          )}
          <LoginForm next={next} />
          <GuideSignupNote />
          <HuntersInviteOnlyNote />
        </div>
      </section>

      <Footer />
    </main>
  )
}
