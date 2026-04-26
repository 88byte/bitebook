import MagicLinkForm from './MagicLinkForm'

export const metadata = { title: 'Sign In — Bite Book' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-8 p-8 min-h-screen"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192x192.png" alt="Bite Book" className="w-16 h-16 rounded-2xl shadow" />
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
          >
            Bite Book
          </h1>
        </div>

        <MagicLinkForm searchParams={searchParams} />

        <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-ink)', opacity: 0.4 }}>
          Hunter accounts require an invite from your guide.
        </p>
      </div>
    </main>
  )
}
