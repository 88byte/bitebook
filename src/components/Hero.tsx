import Image from 'next/image'
import Link from 'next/link'

// Hero — the dark forest scene background, large skull/wordmark on top of it,
// antler flourish, two-line bold tagline in copper sienna, and a small light
// subtitle. The whole composition is static (no animation beyond the initial
// fade-in handled by .bb-hero-in).
//
// Tagline: pass two lines (rendered stacked, second line slightly less weight
// emphasis through line break). Subtitle: a single sentence.
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
      {/* Bottom fade — softens the boundary where the form card lifts up over
          the hero so the join feels intentional, not jarring. */}
      <div className="bb-hero-fade absolute inset-x-0 bottom-0 h-40 pointer-events-none" aria-hidden="true" />

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

        <Image
          src="/bb-antlers.png"
          alt=""
          width={624}
          height={624}
          sizes="(min-width: 768px) 220px, 180px"
          className="h-[140px] w-[140px] sm:h-[170px] sm:w-[170px] md:h-[200px] md:w-[200px] -mt-2"
          aria-hidden="true"
        />

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
