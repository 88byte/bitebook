import Image from 'next/image'
import LoginForm, { GuideSignupNote, HuntersInviteOnlyNote } from './login/LoginForm'
import TopoBackground from '@/components/TopoBackground'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main
      className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:gap-10 sm:py-16 md:gap-12 min-h-screen overflow-hidden"
      style={{ background: 'var(--color-paper)' }}
    >
      <TopoBackground />

      <div className="relative z-10 bb-hero-in">
        <Image
          src="/bb-logo.png"
          alt="Bite Book"
          width={1254}
          height={1254}
          sizes="(min-width: 1024px) 320px, (min-width: 768px) 256px, 192px"
          className="h-48 w-48 sm:h-56 sm:w-56 md:h-64 md:w-64 lg:h-80 lg:w-80 rounded-3xl shadow-lg"
          priority
        />
      </div>

      <p
        className="relative z-10 max-w-5xl text-center text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
      >
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '0.55s' }}>
          Every trip, on the record.
        </span>{' '}
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '0.80s' }}>
          Built with guides.
        </span>{' '}
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '1.05s' }}>
          Lived by hunters.
        </span>
      </p>

      <div className="relative z-10 w-full max-w-sm bb-fade-up" style={{ animationDelay: '1.25s' }}>
        <LoginForm />
        <GuideSignupNote />
        <HuntersInviteOnlyNote />
      </div>

      <Footer />
    </main>
  )
}
