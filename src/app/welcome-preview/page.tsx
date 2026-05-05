import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  Calendar,
  MapPin,
  Users,
  FileSignature,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'

// v27.8.0 preview — public marketing landing for guide acquisition.
// PREVIEW ROUTE ONLY (`/welcome-preview`) — Flavio reviews layout +
// copy on real device before the production `/welcome` route lands.
// Auto-bypasses the auth wall in src/proxy.ts (only /app/* is gated).
// noindex on this preview so it doesn't get crawled before launch;
// production /welcome will set robots: 'index, follow'.
export const metadata: Metadata = {
  title: 'Bite Book — Less paperwork. More hunting. (preview)',
  description:
    'Preview of the Bite Book public landing page. The digital log book built for hunting and fishing guides.',
  robots: 'noindex, nofollow',
}

export default function WelcomePreviewPage() {
  return (
    <main className="bb-welcome">
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="bb-hero relative flex flex-col items-center justify-center text-center px-6 pt-10 pb-12 sm:pt-14 sm:pb-16 min-h-[60vh] sm:min-h-[68vh] overflow-hidden">
        <div
          className="bb-hero-fade absolute inset-x-0 bottom-0 h-32 pointer-events-none"
          aria-hidden="true"
        />
        <div className="bb-hero-in relative z-10 flex flex-col items-center gap-3 sm:gap-4 max-w-2xl w-full">
          <Link href="/welcome-preview" aria-label="Bite Book home">
            <Image
              src="/bb-logo-mark.png"
              alt="Bite Book"
              width={1024}
              height={1024}
              sizes="(min-width: 768px) 180px, 140px"
              className="h-[140px] w-[140px] sm:h-[180px] sm:w-[180px]"
              priority
            />
          </Link>
          <p className="bb-welcome-eyebrow">Bite Book</p>
          <h1 className="bb-tagline-bold leading-tight bb-welcome-tagline">
            Less paperwork.
            <br />
            More hunting.
          </h1>
          <p className="bb-subtitle bb-welcome-hero-sub">
            The digital log book built for hunting and fishing guides. Track trips,
            fill state harvest reports, and share with hunters and wardens — all from
            your phone.
          </p>
          <div className="bb-welcome-hero-cta-row">
            <Link
              href="/signup"
              className="bb-cta bb-welcome-cta-primary"
              aria-label="Start 7-day free trial"
            >
              Start 7-day free trial
            </Link>
            <Link href="/login" className="bb-welcome-secondary-link">
              Already a guide? Sign in →
            </Link>
          </div>
        </div>
      </section>

      {/* ── VALUE PILLARS ─────────────────────────────────────────── */}
      <section className="bb-welcome-section bb-welcome-section-paper">
        <div className="bb-welcome-container">
          <p className="bb-welcome-section-eyebrow">Built for the field</p>
          <h2 className="bb-welcome-section-title">
            Made for guides who&rsquo;d rather be outside.
          </h2>
          <div className="bb-welcome-pillars">
            <Pillar
              icon={Calendar}
              title="Field-ready logs"
              body="Add hunters, log harvests, and generate state forms straight from your phone. Nothing to type twice."
            />
            <Pillar
              icon={MapPin}
              title="All 50 states"
              body="Upload your state's harvest log, map the fields once, and Bite Book auto-fills it for every trip."
            />
            <Pillar
              icon={Users}
              title="Hunters on you"
              body="Invite your hunters by email — free for them. They sign waivers, link tags, and stay in the loop without paying a thing."
            />
            <Pillar
              icon={FileSignature}
              title="Warden-ready PDFs"
              body="One tap, signed PDF in hand. Show it on your screen or share a link."
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
      <section className="bb-welcome-section bb-welcome-section-dark">
        <div className="bb-welcome-container">
          <p className="bb-welcome-section-eyebrow bb-welcome-section-eyebrow-dark">
            How it works
          </p>
          <h2 className="bb-welcome-section-title bb-welcome-section-title-dark">
            Three steps. That&rsquo;s it.
          </h2>
          <div className="bb-welcome-steps">
            <Step
              n={1}
              title="Sign up"
              body="7 days free. No card required."
              image="/banners/dashboard-hero.png"
              imageAlt="Bite Book dashboard preview"
            />
            <Step
              n={2}
              title="Add your trips"
              body="Pull in your hunters, set the dates, mark your state."
              image="/banners/trips-hero.png"
              imageAlt="Trips list preview"
            />
            <Step
              n={3}
              title="File the paperwork"
              body="Bite Book fills your state's harvest log with everything you've already entered."
              image="/banners/wallet-hero.png"
              imageAlt="Wallet preview"
            />
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────── */}
      <section className="bb-welcome-section bb-welcome-section-paper">
        <div className="bb-welcome-container bb-welcome-container-narrow">
          <p className="bb-welcome-section-eyebrow">Pricing</p>
          <h2 className="bb-welcome-section-title">One plan. Try it free.</h2>
          <p className="bb-welcome-section-sub">
            7 days free. No card required. Cancel any time.
          </p>

          <div className="bb-welcome-price-card">
            <div className="bb-welcome-price-toggle" role="group" aria-label="Billing period">
              <span className="bb-welcome-price-toggle-pill is-active">Annual</span>
              <span className="bb-welcome-price-toggle-pill">Monthly</span>
            </div>

            <div className="bb-welcome-price-amount-row">
              <span className="bb-welcome-price-amount">$90</span>
              <span className="bb-welcome-price-period">/year</span>
            </div>
            <p className="bb-welcome-price-savings">
              Save 17% &middot; equals $7.50/month
            </p>
            <p className="bb-welcome-price-monthly-alt">
              or <strong>$9/month</strong>
            </p>

            <ul className="bb-welcome-price-features">
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                All states, all activities
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Unlimited trips and hunters
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Unlimited harvest report PDFs
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Warden share
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Email support
              </li>
            </ul>

            <Link href="/signup" className="bb-cta bb-welcome-price-cta">
              Start 7-day free trial
            </Link>
            <p className="bb-welcome-price-fineprint">
              Hunters are free, forever.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="bb-welcome-section bb-welcome-section-paper">
        <div className="bb-welcome-container bb-welcome-container-narrow">
          <p className="bb-welcome-section-eyebrow">FAQ</p>
          <h2 className="bb-welcome-section-title">Common questions.</h2>
          <div className="bb-welcome-faq">
            <Faq q="Do hunters pay?">
              No. Hunters are free, forever. You invite them by email — they sign in,
              see their trips, link their tags, and that&rsquo;s it.
            </Faq>
            <Faq q="What states are supported?">
              All 50. Upload your state&rsquo;s harvest log PDF once and Bite Book
              fills it for you on every trip after that.
            </Faq>
            <Faq q="Does it work without internet?">
              Most of it. You can view trips, harvests, and saved logs offline. Edits
              sync when you reconnect. (Coming soon — current version requires a
              connection for new edits.)
            </Faq>
            <Faq q="What about insurance, license, business credentials?">
              Stored in your wallet. Bite Book reminds you when something&rsquo;s
              about to expire.
            </Faq>
            <Faq q="Can I cancel any time?">
              Yes. End your trial before day 7 and you pay nothing. Cancel after that
              and you keep access through the end of your billing period.
            </Faq>
            <Faq q="What if I have a question?">
              Email{' '}
              <a href="mailto:support@lastbite.pro" className="bb-welcome-inline-link">
                support@lastbite.pro
              </a>
              . We answer fast — usually same day.
            </Faq>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section className="bb-welcome-section bb-welcome-section-dark bb-welcome-final">
        <div className="bb-welcome-container bb-welcome-container-narrow text-center">
          <h2 className="bb-welcome-final-headline">
            Ready to ditch the paperwork?
          </h2>
          <Link href="/signup" className="bb-cta bb-welcome-final-cta">
            Start 7-day free trial
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="bb-welcome-final-sub">7 days free. No card required.</p>
        </div>
      </section>

      {/* ── MARKETING FOOTER ──────────────────────────────────────── */}
      <footer className="bb-welcome-footer">
        <div className="bb-welcome-container bb-welcome-footer-inner">
          <div className="bb-welcome-footer-brand">
            <Image
              src="/bb-logo-mark.png"
              alt=""
              width={1024}
              height={1024}
              sizes="48px"
              className="h-12 w-12"
            />
            <span className="bb-welcome-footer-brand-text">Bite Book</span>
            <p className="bb-welcome-footer-tag">
              The digital log book for hunting and fishing guides.
            </p>
          </div>
          <div className="bb-welcome-footer-cols">
            <FooterCol
              heading="Product"
              links={[
                { label: 'Sign in', href: '/login' },
                { label: 'Sign up', href: '/signup' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'FAQ', href: '#faq' },
              ]}
            />
            <FooterCol
              heading="Company"
              links={[
                { label: 'Last Bite Pro', href: 'https://lastbite.pro/', external: true },
              ]}
            />
            <FooterCol
              heading="Legal"
              links={[
                { label: 'Terms', href: 'https://lastbite.pro/terms', external: true },
                { label: 'Privacy', href: 'https://lastbite.pro/privacy', external: true },
                { label: 'Support', href: 'mailto:support@lastbite.pro' },
              ]}
            />
          </div>
        </div>
        <div className="bb-welcome-footer-bottom">
          © 2026 Bite Book &middot; Field-tested for guides and hunters
        </div>
      </footer>

      {/* Page-scoped styles. Uses brand tokens defined in globals.css.
          Kept inline so the preview is a single artifact Flavio can
          review without hunting through the CSS file. Once approved,
          these will move into globals.css alongside the production
          /welcome route. */}
      <style>{`
        .bb-welcome { display: block; }

        .bb-welcome-eyebrow {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: rgba(244, 239, 229, 0.65);
          margin: 0;
        }
        .bb-welcome-tagline {
          font-size: clamp(2.1rem, 7vw, 3.6rem);
          margin: 0.5rem 0 0.5rem;
        }
        .bb-welcome-hero-sub {
          max-width: 32rem;
          font-size: 1rem;
          line-height: 1.55;
        }
        @media (min-width: 768px) {
          .bb-welcome-hero-sub { font-size: 1.1rem; max-width: 40rem; }
        }
        .bb-welcome-hero-cta-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.85rem;
          margin-top: 1.25rem;
          width: 100%;
          max-width: 22rem;
        }
        .bb-welcome-cta-primary {
          width: 100%;
        }
        .bb-welcome-secondary-link {
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          color: rgba(244, 239, 229, 0.78);
          text-decoration: none;
          font-weight: 500;
        }
        .bb-welcome-secondary-link:hover { color: #FFFFFF; }

        /* Section wrappers */
        .bb-welcome-section {
          padding: 3.5rem 1.25rem;
        }
        @media (min-width: 768px) {
          .bb-welcome-section { padding: 5rem 2rem; }
        }
        .bb-welcome-section-paper {
          background: var(--color-paper);
          color: var(--color-ink);
        }
        .bb-welcome-section-dark {
          background: var(--color-page-bg);
          color: #F4EFE5;
        }
        .bb-welcome-container {
          max-width: 1080px;
          margin: 0 auto;
        }
        .bb-welcome-container-narrow { max-width: 720px; }
        .bb-welcome-section-eyebrow {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--color-copper);
          margin: 0 0 0.65rem;
        }
        .bb-welcome-section-eyebrow-dark { color: #D89169; }
        .bb-welcome-section-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(1.85rem, 5vw, 2.65rem);
          line-height: 1.1;
          margin: 0 0 1.5rem;
          color: var(--color-ink);
        }
        .bb-welcome-section-title-dark { color: #FFFFFF; }
        .bb-welcome-section-sub {
          font-family: var(--font-barlow);
          font-size: 1.05rem;
          color: var(--color-ink-soft);
          margin: 0 0 2rem;
          max-width: 36rem;
        }

        /* Pillars */
        .bb-welcome-pillars {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          margin-top: 0.5rem;
        }
        @media (min-width: 640px) {
          .bb-welcome-pillars { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
        }
        @media (min-width: 1024px) {
          .bb-welcome-pillars { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        .bb-welcome-pillar {
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 14px;
          padding: 1.25rem;
        }
        .bb-welcome-pillar-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.4rem;
          height: 2.4rem;
          border-radius: 999px;
          background: var(--color-copper);
          color: #FFFFFF;
          margin-bottom: 0.85rem;
        }
        .bb-welcome-pillar-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.15rem;
          letter-spacing: 0.02em;
          margin: 0 0 0.4rem;
          color: var(--color-ink);
        }
        .bb-welcome-pillar-body {
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          line-height: 1.5;
          color: var(--color-ink-muted);
          margin: 0;
        }

        /* How it works steps */
        .bb-welcome-steps {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
          margin-top: 1rem;
        }
        @media (min-width: 1024px) {
          .bb-welcome-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2rem; }
        }
        .bb-welcome-step {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .bb-welcome-step-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border-radius: 999px;
          background: var(--color-copper);
          color: #FFFFFF;
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1rem;
        }
        .bb-welcome-step-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.3rem;
          margin: 0;
          color: #FFFFFF;
        }
        .bb-welcome-step-body {
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          line-height: 1.55;
          color: rgba(244, 239, 229, 0.78);
          margin: 0 0 0.5rem;
        }
        .bb-welcome-step-image {
          width: 100%;
          height: auto;
          border-radius: 10px;
          border: 1px solid rgba(244, 239, 229, 0.12);
          aspect-ratio: 3 / 1;
          object-fit: cover;
          object-position: center;
        }

        /* Pricing */
        .bb-welcome-price-card {
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 16px;
          padding: 2rem 1.5rem;
          margin-top: 1.5rem;
          box-shadow: 0 18px 36px rgba(11, 8, 6, 0.08);
        }
        @media (min-width: 768px) { .bb-welcome-price-card { padding: 2.5rem 2rem; } }
        .bb-welcome-price-toggle {
          display: inline-flex;
          gap: 0.4rem;
          padding: 0.3rem;
          border-radius: 999px;
          background: rgba(176, 108, 60, 0.08);
          margin-bottom: 1.25rem;
        }
        .bb-welcome-price-toggle-pill {
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--color-ink-muted);
        }
        .bb-welcome-price-toggle-pill.is-active {
          background: var(--color-copper);
          color: #FFFFFF;
        }
        .bb-welcome-price-amount-row {
          display: flex;
          align-items: baseline;
          gap: 0.4rem;
          margin-top: 0.25rem;
        }
        .bb-welcome-price-amount {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 3.2rem;
          line-height: 1;
          color: var(--color-ink);
        }
        .bb-welcome-price-period {
          font-family: var(--font-barlow);
          font-size: 1.05rem;
          color: var(--color-ink-soft);
        }
        .bb-welcome-price-savings {
          font-family: var(--font-barlow);
          font-size: 0.9rem;
          color: #4A6B3E;
          font-weight: 600;
          margin: 0.4rem 0 0;
        }
        .bb-welcome-price-monthly-alt {
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: var(--color-ink-soft);
          margin: 0.85rem 0 0;
        }
        .bb-welcome-price-monthly-alt strong { color: var(--color-ink); }
        .bb-welcome-price-features {
          list-style: none;
          padding: 0;
          margin: 1.25rem 0 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .bb-welcome-price-features li {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          color: var(--color-ink);
        }
        .bb-welcome-price-features li svg { color: var(--color-copper); flex-shrink: 0; }
        .bb-welcome-price-cta { width: 100%; }
        .bb-welcome-price-fineprint {
          text-align: center;
          font-family: var(--font-barlow);
          font-size: 0.85rem;
          color: var(--color-ink-soft);
          margin: 0.85rem 0 0;
        }

        /* FAQ */
        .bb-welcome-faq {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .bb-welcome-faq-item {
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 12px;
          padding: 0;
          overflow: hidden;
        }
        .bb-welcome-faq-item summary {
          padding: 1rem 1.25rem;
          cursor: pointer;
          font-family: var(--font-barlow);
          font-weight: 600;
          font-size: 1rem;
          color: var(--color-ink);
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .bb-welcome-faq-item summary::-webkit-details-marker { display: none; }
        .bb-welcome-faq-item summary::after {
          content: '+';
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.4rem;
          color: var(--color-copper);
          transition: transform 0.18s;
        }
        .bb-welcome-faq-item[open] summary::after {
          content: '−';
        }
        .bb-welcome-faq-body {
          padding: 0 1.25rem 1rem;
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          line-height: 1.55;
          color: var(--color-ink-muted);
        }
        .bb-welcome-inline-link {
          color: var(--color-copper);
          text-decoration: underline;
        }

        /* Final CTA */
        .bb-welcome-final {
          padding-top: 4rem;
          padding-bottom: 4rem;
        }
        .bb-welcome-final-headline {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(1.85rem, 5vw, 2.65rem);
          line-height: 1.1;
          margin: 0 0 1.5rem;
          color: #FFFFFF;
        }
        .bb-welcome-final-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          width: auto;
          padding-left: 2rem;
          padding-right: 2rem;
        }
        .bb-welcome-final-sub {
          margin: 1rem 0 0;
          font-family: var(--font-barlow);
          font-size: 0.9rem;
          color: rgba(244, 239, 229, 0.65);
        }

        /* Footer */
        .bb-welcome-footer {
          background: #07050a;
          color: rgba(244, 239, 229, 0.78);
          padding: 3rem 1.25rem 1.25rem;
        }
        @media (min-width: 768px) { .bb-welcome-footer { padding: 4rem 2rem 1.5rem; } }
        .bb-welcome-footer-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2.5rem;
        }
        @media (min-width: 768px) {
          .bb-welcome-footer-inner { grid-template-columns: 1.2fr 2fr; gap: 3rem; }
        }
        .bb-welcome-footer-brand {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .bb-welcome-footer-brand-text {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: 0.04em;
          color: #FFFFFF;
          text-transform: uppercase;
        }
        .bb-welcome-footer-tag {
          font-family: var(--font-barlow);
          font-size: 0.9rem;
          color: rgba(244, 239, 229, 0.55);
          margin: 0;
          max-width: 22rem;
        }
        .bb-welcome-footer-cols {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1.25rem;
        }
        @media (max-width: 480px) {
          .bb-welcome-footer-cols { grid-template-columns: 1fr 1fr; gap: 1.5rem; }
          .bb-welcome-footer-cols > :nth-child(3) { grid-column: span 2; }
        }
        .bb-welcome-footer-col-heading {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(244, 239, 229, 0.55);
          margin: 0 0 0.75rem;
        }
        .bb-welcome-footer-col-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .bb-welcome-footer-col-list a {
          font-family: var(--font-barlow);
          font-size: 0.9rem;
          color: rgba(244, 239, 229, 0.78);
          text-decoration: none;
        }
        .bb-welcome-footer-col-list a:hover { color: #FFFFFF; }
        .bb-welcome-footer-bottom {
          margin-top: 2.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid rgba(244, 239, 229, 0.08);
          font-family: var(--font-barlow);
          font-size: 0.78rem;
          color: rgba(244, 239, 229, 0.4);
          text-align: center;
        }
      `}</style>
    </main>
  )
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Calendar
  title: string
  body: string
}) {
  return (
    <div className="bb-welcome-pillar">
      <span className="bb-welcome-pillar-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <h3 className="bb-welcome-pillar-title">{title}</h3>
      <p className="bb-welcome-pillar-body">{body}</p>
    </div>
  )
}

function Step({
  n,
  title,
  body,
  image,
  imageAlt,
}: {
  n: number
  title: string
  body: string
  image: string
  imageAlt: string
}) {
  return (
    <div className="bb-welcome-step">
      <span className="bb-welcome-step-num" aria-hidden="true">
        {n}
      </span>
      <h3 className="bb-welcome-step-title">{title}</h3>
      <p className="bb-welcome-step-body">{body}</p>
      <Image
        src={image}
        alt={imageAlt}
        width={2172}
        height={724}
        sizes="(min-width: 1024px) 360px, 100vw"
        className="bb-welcome-step-image"
      />
    </div>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="bb-welcome-faq-item">
      <summary>{q}</summary>
      <div className="bb-welcome-faq-body">{children}</div>
    </details>
  )
}

function FooterCol({
  heading,
  links,
}: {
  heading: string
  links: Array<{ label: string; href: string; external?: boolean }>
}) {
  return (
    <div>
      <p className="bb-welcome-footer-col-heading">{heading}</p>
      <ul className="bb-welcome-footer-col-list">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noreferrer noopener">
                {l.label}
              </a>
            ) : (
              <Link href={l.href}>{l.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
