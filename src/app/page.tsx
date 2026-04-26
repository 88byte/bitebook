import Image from 'next/image'
import LoginForm, { GuideSignupNote, HuntersInviteOnlyNote } from './login/LoginForm'
import TopoBackground from '@/components/TopoBackground'
import RotatingTagline from '@/components/RotatingTagline'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main
      className="relative flex flex-1 flex-col items-center px-6 pt-6 min-h-screen overflow-hidden"
      style={{ background: 'var(--color-paper)' }}
    >
      <TopoBackground />

      {/* Top spacer biases the hero downward toward the lower-middle band of the
          viewport without bottom-aligning it. Floor scales up at sm so larger
          screens get more breathing room above the logo; on tight mobile
          viewports it can collapse to keep the form above the fold. */}
      <div className="flex-[1.3] min-h-[2vh] sm:min-h-[8vh]" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center gap-5 sm:gap-7 md:gap-8 w-full">
        <div className="bb-hero-in">
          <Image
            src="/bb-logo.png"
            alt="Bite Book"
            width={1254}
            height={1254}
            sizes="(min-width: 1024px) 288px, (min-width: 768px) 240px, 176px"
            className="h-40 w-40 sm:h-48 sm:w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 rounded-3xl shadow-lg"
            priority
          />
        </div>

        <RotatingTagline />

        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.45s' }}>
          <LoginForm />
          <GuideSignupNote />
          <HuntersInviteOnlyNote />
        </div>
      </div>

      <div className="flex-1 min-h-[2vh] sm:min-h-[4vh]" aria-hidden="true" />

      <Footer />
    </main>
  )
}
