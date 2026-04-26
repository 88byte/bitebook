import Image from 'next/image'
import Link from 'next/link'
import LoginForm, { GuideSignupNote, HuntersInviteOnlyNote } from './LoginForm'
import TopoBackground from '@/components/TopoBackground'
import Footer from '@/components/Footer'

export const metadata = { title: 'Sign In — Bite Book' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <main
      className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:gap-10 sm:py-16 min-h-screen overflow-hidden"
      style={{ background: 'var(--color-paper)' }}
    >
      <TopoBackground />
      <Link href="/" className="bb-fade-up" style={{ animationDelay: '0.05s' }}>
        <Image
          src="/bb-logo.png"
          alt="Bite Book"
          width={1254}
          height={1254}
          sizes="(min-width: 1024px) 224px, (min-width: 768px) 192px, 160px"
          className="h-40 w-40 sm:h-48 sm:w-48 md:h-52 md:w-52 lg:h-56 lg:w-56 rounded-3xl shadow-lg"
          priority
        />
      </Link>

      <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.25s' }}>
        {error === 'auth_failed' && (
          <p className="mb-3 rounded-lg px-3 py-2 text-xs text-center" style={{ background: '#fef2f2', color: '#dc2626' }}>
            That sign-in link expired or was already used. Please try again.
          </p>
        )}
        <LoginForm next={next} />
        <GuideSignupNote />
        <HuntersInviteOnlyNote />
      </div>
      <Footer />
    </main>
  )
}
