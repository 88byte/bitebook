import LoginForm, { GuideSignupNote, HuntersInviteOnlyNote } from './login/LoginForm'
import DarkHero from '@/components/DarkHero'
import RotatingTagline from '@/components/RotatingTagline'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero tagline={<RotatingTagline />} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.15s' }}>
          <LoginForm />
          <GuideSignupNote />
          <HuntersInviteOnlyNote />
        </div>
      </section>

      <Footer />
    </main>
  )
}
