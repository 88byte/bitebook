import Image from 'next/image'
import Link from 'next/link'

// Hero — dark forest scene at top, skull/wordmark, copper bold tagline,
// light subtitle, and a small antler flourish below the subtitle (just
// above the form-card lift). Static (entrance fade only). Hero gradient-
// fades into the unified dark page bg at the bottom — no visible seam.
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
    <section className="bb-hero relative flex flex-col items-center justify-center text-center px-6 pt-6 pb-4 sm:pt-10 sm:pb-12 min-h-[42vh] sm:min-h-[58vh] md:min-h-[56vh] overflow-hidden">
      <div className="bb-hero-fade absolute inset-x-0 bottom-0 h-32 pointer-events-none" aria-hidden="true" />

      <div className="bb-hero-in relative z-10 flex flex-col items-center gap-2 sm:gap-3 max-w-md w-full">
        <Link href="/" aria-label="Bite Book home">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="(min-width: 1024px) 360px, (min-width: 768px) 300px, 170px"
            className="h-[170px] w-[170px] sm:h-[240px] sm:w-[240px] md:h-[300px] md:w-[300px] lg:h-[360px] lg:w-[360px]"
            priority
          />
        </Link>

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

        <div className="bb-flourish-row mt-1" aria-hidden="true">
          <FlourishLine />
          <Image
            src="/bb-antlers.png"
            alt=""
            width={624}
            height={624}
            sizes="(min-width: 768px) 64px, 54px"
            className="h-[54px] w-[54px] sm:h-[60px] sm:w-[60px] md:h-[64px] md:w-[64px]"
          />
          <FlourishLine />
        </div>
      </div>
    </section>
  )
}

// Simple straight horizontal line, copper at low opacity. Used as a quiet
// flanker around the small antler emblem — no diamond/pip caps.
function FlourishLine() {
  return (
    <span
      aria-hidden="true"
      className="block h-px"
      style={{ width: '50px', backgroundColor: '#B06C3C', opacity: 0.45 }}
    />
  )
}
