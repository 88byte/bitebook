import Image from 'next/image'
import Link from 'next/link'
import SignupForm from './SignupForm'
import TopoBackground from '@/components/TopoBackground'
import Footer from '@/components/Footer'

export const metadata = { title: 'Start your free trial — Bite Book' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>
}) {
  const { canceled } = await searchParams

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
          sizes="(min-width: 1024px) 192px, (min-width: 768px) 160px, 128px"
          className="h-32 w-32 sm:h-40 sm:w-40 md:h-44 md:w-44 lg:h-48 lg:w-48 rounded-3xl shadow-lg"
          priority
        />
      </Link>

      <div className="w-full max-w-md bb-fade-up" style={{ animationDelay: '0.25s' }}>
        <h1 className="text-center text-3xl mb-1" style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}>
          7 days free. No card required.
        </h1>
        <p className="text-center text-xs mb-4" style={{ color: 'var(--color-ink)', opacity: 0.65 }}>
          Built with guides. Run every trip on the record.
        </p>
        {canceled && (
          <p className="mb-3 text-xs text-center rounded-lg px-3 py-2" style={{ background: '#fff7ed', color: '#9a3412' }}>
            Checkout canceled. You can try again whenever you&rsquo;re ready.
          </p>
        )}
        <SignupForm />
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
          Already have an account?{' '}
          <Link href="/login" className="underline" style={{ color: 'var(--color-accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
      <Footer />
    </main>
  )
}
