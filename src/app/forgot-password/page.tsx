import Image from 'next/image'
import Link from 'next/link'
import ForgotPasswordForm from './ForgotPasswordForm'
import TopoBackground from '@/components/TopoBackground'
import Footer from '@/components/Footer'

export const metadata = { title: 'Reset password — Bite Book' }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <main
      className="relative flex flex-1 flex-col px-6 min-h-screen overflow-hidden"
      style={{ background: 'var(--color-paper)' }}
    >
      <TopoBackground />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 sm:gap-10 py-12 sm:py-16 w-full">
        <Link href="/" className="bb-fade-up" style={{ animationDelay: '0.05s' }}>
          <Image
            src="/bb-logo.png"
            alt="Bite Book"
            width={1254}
            height={1254}
            sizes="(min-width: 1024px) 192px, (min-width: 768px) 160px, 128px"
            className="h-32 w-32 sm:h-40 sm:w-40 md:h-44 md:w-44 lg:h-48 lg:w-48 rounded-3xl shadow-lg"
            priority
          />
        </Link>

        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.25s' }}>
          <h1 className="text-center text-2xl mb-1" style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}>
            Forgot your password?
          </h1>
          <p className="text-center text-xs mb-4" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
            We&rsquo;ll email you a link to set a new one.
          </p>
          <ForgotPasswordForm initialEmail={email} />
          <p className="mt-4 text-center text-xs">
            <Link href="/login" className="underline" style={{ color: 'var(--color-accent)' }}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>

      <Footer />
    </main>
  )
}
