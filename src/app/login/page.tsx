import Image from 'next/image'
import MagicLinkForm, { InviteOnlyNote } from './MagicLinkForm'

export const metadata = { title: 'Sign In — Bite Book' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:gap-10 sm:py-16 md:gap-12 min-h-screen"
      style={{ background: 'var(--color-paper)' }}
    >
      <Image
        src="/icon-192x192.png"
        alt="Bite Book"
        width={384}
        height={384}
        sizes="(min-width: 1024px) 256px, (min-width: 768px) 224px, 176px"
        className="h-44 w-44 sm:h-48 sm:w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 rounded-3xl shadow-lg"
        priority
      />

      <div className="w-full max-w-sm">
        <MagicLinkForm next={next} />
        <InviteOnlyNote />
      </div>
    </main>
  )
}
