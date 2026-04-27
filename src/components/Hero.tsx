import Image from 'next/image'
import Link from 'next/link'

// Hero — dark forest scene at top, large skull/wordmark, antler row with
// gun-sight pip flourishes, two-line bold copper tagline, light subtitle.
// Static (entrance fade only). The bottom of the section gradient-fades into
// the unified dark page background so there's no visible seam.
export default function Hero({
  taglineLine1,
  taglineLine2,
  subtitle,
}: {
  taglineLine1: string
  taglineLine2?: string
  subtitle: string
}) {
  return (
    <section className="bb-hero relative flex flex-col items-center justify-center text-center px-6 pt-12 pb-24 sm:pt-16 sm:pb-32 min-h-[78vh] sm:min-h-[72vh] md:min-h-[68vh] overflow-hidden">
      <div className="bb-hero-fade absolute inset-x-0 bottom-0 h-44 pointer-events-none" aria-hidden="true" />

      <div className="bb-hero-in relative z-10 flex flex-col items-center gap-4 sm:gap-5 max-w-md w-full">
        <Link href="/" aria-label="Bite Book home">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="(min-width: 1024px) 360px, (min-width: 768px) 320px, 260px"
            className="h-[260px] w-[260px] sm:h-[300px] sm:w-[300px] md:h-[320px] md:w-[320px] lg:h-[360px] lg:w-[360px]"
            priority
          />
        </Link>

        <div className="bb-flourish-row" aria-hidden="true">
          <FlourishPip side="left" />
          <Image
            src="/bb-antlers.png"
            alt=""
            width={624}
            height={624}
            sizes="(min-width: 768px) 130px, 100px"
            className="h-[100px] w-[100px] sm:h-[120px] sm:w-[120px] md:h-[140px] md:w-[140px]"
          />
          <FlourishPip side="right" />
        </div>

        <h1 className="bb-tagline-bold leading-tight">
          {taglineLine1}
          {taglineLine2 ? (
            <>
              <br />
              {taglineLine2}
            </>
          ) : null}
        </h1>

        <p className="bb-subtitle max-w-[20rem] sm:max-w-[24rem]">{subtitle}</p>
      </div>
    </section>
  )
}

// Small ornament: a copper diamond pip + horizontal hash. Mirrored on each
// side of the antler row so the antlers read as a centered emblem.
function FlourishPip({ side }: { side: 'left' | 'right' }) {
  const flip = side === 'right' ? { transform: 'scaleX(-1)' } : undefined
  return (
    <svg
      width="44"
      height="10"
      viewBox="0 0 44 10"
      fill="none"
      style={flip}
      aria-hidden="true"
    >
      {/* Long line */}
      <line x1="14" y1="5" x2="42" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.85" />
      {/* Diamond pip */}
      <path d="M5 5 L9 1 L13 5 L9 9 Z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}
