import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  PenLine,
  MapPin,
  Users,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Smartphone,
  Clock,
  FileText,
  Mail,
} from 'lucide-react'

// v27.8.0-preview2 — full design + SEO pass. Audience: hunting and
// fishing guides. Voice: terse, concrete, field-spoken. NO corporate
// SaaS speak ("platform", "leverage", "stakeholders" all banned).
// Real form names + real pain points. No fabricated testimonials.
//
// Preview route only — production /welcome will land separately with
// `robots: 'index, follow'` + canonical pointing here. This page is
// noindex'd.
export const metadata: Metadata = {
  title: 'Bite Book — Digital log book for hunting & fishing guides',
  description:
    'Track trips, fill state harvest reports, and share with hunters and wardens — from your phone. Built for guides. 7 days free, no card required.',
  robots: 'noindex, nofollow',
  alternates: { canonical: 'https://bitebook.lastbite.pro/welcome-preview' },
  openGraph: {
    type: 'website',
    title: 'Bite Book — Digital log book for hunting & fishing guides',
    description:
      'Track trips, fill state harvest reports, and share with hunters and wardens — from your phone. 7 days free, no card required.',
    url: 'https://bitebook.lastbite.pro/welcome-preview',
    siteName: 'Bite Book',
    images: [
      {
        url: 'https://bitebook.lastbite.pro/banners/dashboard-hero.png',
        width: 2172,
        height: 724,
        alt: 'Bite Book — guide dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bite Book — Digital log book for hunting & fishing guides',
    description:
      'Track trips, fill state harvest reports, and share with hunters and wardens — from your phone.',
    images: ['https://bitebook.lastbite.pro/banners/dashboard-hero.png'],
  },
  keywords: [
    'hunt log app',
    'fishing guide log',
    'harvest report software',
    'guide license tracker',
    'CDFW 992-B',
    'state hunt report',
    'warden share',
    'digital hunt log',
    'outfitter software',
    'hunting guide app',
  ],
}

// JSON-LD structured data — pulled out so the page render stays clean.
// Three blocks: Organization, Product (with pricing), FAQPage. Google
// uses these for rich snippets.
const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bite Book',
  url: 'https://bitebook.lastbite.pro/',
  logo: 'https://bitebook.lastbite.pro/bb-logo-mark.png',
  description: 'Digital log book for hunting and fishing guides.',
  parentOrganization: {
    '@type': 'Organization',
    name: 'Last Bite Pro',
    url: 'https://lastbite.pro/',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'Customer Support',
    email: 'support@lastbite.pro',
  },
}

const PRODUCT_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Bite Book',
  description:
    'Digital log book for hunting and fishing guides. Trip tracking, state harvest reports, hunter coordination, warden share.',
  brand: { '@type': 'Brand', name: 'Bite Book' },
  offers: [
    {
      '@type': 'Offer',
      price: '9.00',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '9.00',
        priceCurrency: 'USD',
        unitText: 'MON',
      },
      availability: 'https://schema.org/InStock',
      url: 'https://bitebook.lastbite.pro/signup',
    },
    {
      '@type': 'Offer',
      price: '90.00',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '90.00',
        priceCurrency: 'USD',
        unitText: 'ANN',
      },
      availability: 'https://schema.org/InStock',
      url: 'https://bitebook.lastbite.pro/signup',
    },
  ],
}

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does it actually fill the CDFW 992-B?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "Yes. And the ODFW Form 1009. And the NMDGF harvest report. Upload your state's PDF once and Bite Book maps every field for you. We support every state.",
      },
    },
    {
      '@type': 'Question',
      name: 'What does it cost my hunters?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "Nothing. They never pay a dime. Invite them by email, they sign in, see their trips, link their tags. That's it.",
      },
    },
    {
      '@type': 'Question',
      name: 'Will it work in places without service?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "Most of it. View trips, harvests, and saved logs offline. Full offline editing is in active development. For now, new edits need a connection.",
      },
    },
    {
      '@type': 'Question',
      name: 'What about my insurance and license docs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "They live in your wallet. Bite Book reminds you when something's about to expire so you're never caught without proof.",
      },
    },
    {
      '@type': 'Question',
      name: 'Can my hunters sign waivers from their phone?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "Yes. They tap the link in their email, sign on their phone, and you get the signed PDF immediately. Same with the harvest report after the hunt.",
      },
    },
    {
      '@type': 'Question',
      name: "I'm a one-person outfit. Worth it for me?",
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          "That's exactly who Bite Book was built for. The annual plan is $7.50 a month. One trip pays for it.",
      },
    },
  ],
}

export default function WelcomePreviewPage() {
  return (
    <main className="bb-mkt">
      {/* Structured data — emitted as JSON-LD <script> tags so search
          engines can pick up Organization + Product + FAQ for rich
          snippets. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        className="bb-hero relative overflow-hidden"
        aria-labelledby="bb-mkt-hero-title"
      >
        <div
          className="bb-hero-fade absolute inset-x-0 bottom-0 h-32 pointer-events-none"
          aria-hidden="true"
        />
        <div className="bb-mkt-hero-inner">
          <Link
            href="/welcome-preview"
            aria-label="Bite Book home"
            className="bb-mkt-hero-mark-link"
          >
            <Image
              src="/bb-logo-mark.png"
              alt="Bite Book"
              width={1024}
              height={1024}
              sizes="(min-width: 768px) 96px, 80px"
              className="bb-mkt-hero-mark"
              priority
            />
          </Link>
          <p className="bb-mkt-eyebrow">Bite Book &middot; for guides &middot; field-tested</p>
          <h1 id="bb-mkt-hero-title" className="bb-mkt-hero-title">
            Less paperwork.
            <br />
            <span className="bb-mkt-hero-title-accent">More hunting.</span>
          </h1>
          <p className="bb-mkt-hero-sub">
            The digital log book for hunting and fishing guides. Track trips, fill
            your state&rsquo;s harvest report, and share with hunters and wardens
            &mdash; all from your phone.
          </p>
          <div className="bb-mkt-hero-cta-row">
            <Link href="/signup" className="bb-cta bb-mkt-cta-primary">
              Start 7-day free trial
            </Link>
            <Link href="/login" className="bb-mkt-secondary-link">
              Already a guide? Sign in <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="bb-mkt-trust-row" aria-label="What you get">
            <li>
              <ShieldCheck size={14} aria-hidden="true" />
              All 50 states
            </li>
            <li>
              <Smartphone size={14} aria-hidden="true" />
              Built for the field
            </li>
            <li>
              <Clock size={14} aria-hidden="true" />
              No card required
            </li>
          </ul>
        </div>
      </section>

      {/* ── PAIN / GAIN — 4 PILLARS ──────────────────────────────── */}
      <section
        className="bb-mkt-section bb-mkt-section-paper"
        aria-labelledby="bb-mkt-pillars-title"
      >
        <div className="bb-mkt-container">
          <p className="bb-mkt-section-eyebrow">Built for guides who&rsquo;d rather be outside</p>
          <h2 id="bb-mkt-pillars-title" className="bb-mkt-section-title">
            The truck-cab paperwork problem, solved.
          </h2>
          <div className="bb-mkt-pillars">
            <Pillar
              icon={PenLine}
              title="Stop typing in the truck."
              body="Add hunters, log harvests, and generate state reports right from your phone. Bite Book has every field your state asks for &mdash; already there, ready to fill."
            />
            <Pillar
              icon={MapPin}
              title="Your state's forms. Already filled."
              body="Upload your state's PDF once. Bite Book auto-fills it for every trip after that. CDFW 992-B, ODFW 1009, NMDGF report &mdash; you name it."
            />
            <Pillar
              icon={Users}
              title="Hunters don't pay. Ever."
              body="Invite hunters by email &mdash; free for them. They sign waivers, link tags, and stay in the loop. You handle one bill, not seven."
            />
            <Pillar
              icon={ShieldCheck}
              title="Warden walks up. You're ready."
              body="One tap, signed PDF in hand. Show it on your phone or share a link. Real signatures, real timestamps, real audit trail."
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — 3 STEPS ───────────────────────────────── */}
      <section
        className="bb-mkt-section bb-mkt-section-dark"
        aria-labelledby="bb-mkt-steps-title"
      >
        <div className="bb-mkt-container">
          <p className="bb-mkt-section-eyebrow bb-mkt-section-eyebrow-dark">
            How it works
          </p>
          <h2
            id="bb-mkt-steps-title"
            className="bb-mkt-section-title bb-mkt-section-title-dark"
          >
            Three steps. That&rsquo;s it.
          </h2>
          <ol className="bb-mkt-steps">
            <Step
              n={1}
              icon={Mail}
              title="Sign up"
              body="7 days free. No card. Pick your state and you're in."
            />
            <Step
              n={2}
              icon={MapPin}
              title="Add a trip"
              body="Pull in your hunters, set the dates, mark species and zone. Bite Book remembers it all."
            />
            <Step
              n={3}
              icon={FileText}
              title="File the report"
              body="Tap Generate. Bite Book fills your state's PDF, signs it, and you're done before dinner."
            />
          </ol>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────── */}
      <section
        className="bb-mkt-section bb-mkt-section-paper"
        id="pricing"
        aria-labelledby="bb-mkt-pricing-title"
      >
        <div className="bb-mkt-container bb-mkt-container-narrow">
          <p className="bb-mkt-section-eyebrow">Pricing</p>
          <h2 id="bb-mkt-pricing-title" className="bb-mkt-section-title">
            One plan. Try it free.
          </h2>
          <p className="bb-mkt-section-sub">
            7 days free. No card required. Cancel any time.
          </p>

          <div className="bb-mkt-price-card">
            <div className="bb-mkt-price-tag">Best value &middot; save $18 a year</div>

            <div className="bb-mkt-price-toggle" role="group" aria-label="Billing period">
              <span className="bb-mkt-price-toggle-pill is-active">Annual</span>
              <span className="bb-mkt-price-toggle-pill">Monthly</span>
            </div>

            <div className="bb-mkt-price-amount-row">
              <span className="bb-mkt-price-amount">$90</span>
              <span className="bb-mkt-price-period">/year</span>
            </div>
            <p className="bb-mkt-price-equivalence">
              That&rsquo;s <strong>$7.50 a month.</strong> One trip pays for it.
            </p>
            <p className="bb-mkt-price-monthly-alt">
              Or pay monthly: <strong>$9/month</strong>
            </p>

            <ul className="bb-mkt-price-features">
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                All 50 states &middot; hunting and fishing
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
                E-signatures on waivers and reports
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Wallet for license, insurance, credentials
              </li>
              <li>
                <CheckCircle2 size={16} aria-hidden="true" />
                Warden share &middot; same-day email support
              </li>
            </ul>

            <Link href="/signup" className="bb-cta bb-mkt-price-cta">
              Start 7-day free trial
            </Link>
            <p className="bb-mkt-price-fineprint">
              Hunters are free, forever &middot; cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section
        className="bb-mkt-section bb-mkt-section-paper bb-mkt-section-faq"
        id="faq"
        aria-labelledby="bb-mkt-faq-title"
      >
        <div className="bb-mkt-container bb-mkt-container-narrow">
          <p className="bb-mkt-section-eyebrow">Questions guides ask</p>
          <h2 id="bb-mkt-faq-title" className="bb-mkt-section-title">
            Real answers, in plain English.
          </h2>
          <div className="bb-mkt-faq">
            <Faq q="Does it actually fill the CDFW 992-B?">
              Yes. And the ODFW Form 1009. And the NMDGF harvest report. Upload your
              state&rsquo;s PDF once and Bite Book maps every field for you. We
              support every state.
            </Faq>
            <Faq q="What does it cost my hunters?">
              Nothing. They never pay a dime. Invite them by email, they sign in,
              see their trips, link their tags. That&rsquo;s it.
            </Faq>
            <Faq q="Will it work in places without service?">
              Most of it. View trips, harvests, and saved logs offline. Full offline
              editing is in active development. For now, new edits need a
              connection.
            </Faq>
            <Faq q="What about my insurance and license docs?">
              They live in your wallet. Bite Book reminds you when something&rsquo;s
              about to expire so you&rsquo;re never caught without proof.
            </Faq>
            <Faq q="Can my hunters sign waivers from their phone?">
              Yes. They tap the link in their email, sign on their phone, and you
              get the signed PDF immediately. Same with the harvest report after the
              hunt.
            </Faq>
            <Faq q="How do I cancel?">
              Tap once in Settings. End your trial before day 7 and you pay nothing.
              Cancel anytime after &mdash; you keep access until your billing period
              ends.
            </Faq>
            <Faq q="I'm a one-person outfit. Worth it for me?">
              That&rsquo;s exactly who Bite Book was built for. You spend less time on
              paperwork, more time guiding. The annual plan is $7.50 a month. One
              trip pays for it.
            </Faq>
          </div>
          <p className="bb-mkt-faq-foot">
            Have a question we didn&rsquo;t cover? Email{' '}
            <a href="mailto:support@lastbite.pro" className="bb-mkt-inline-link">
              support@lastbite.pro
            </a>{' '}
            &mdash; we answer fast, usually same day.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section
        className="bb-mkt-section bb-mkt-section-dark bb-mkt-final"
        aria-labelledby="bb-mkt-final-title"
      >
        <div className="bb-mkt-container bb-mkt-container-narrow text-center">
          <p className="bb-mkt-section-eyebrow bb-mkt-section-eyebrow-dark">
            Sunup tomorrow
          </p>
          <h2 id="bb-mkt-final-title" className="bb-mkt-final-headline">
            Be ready before the truck lights come on.
          </h2>
          <p className="bb-mkt-final-sub-top">
            Set up Bite Book in five minutes tonight. Skip the paperwork tomorrow.
          </p>
          <Link href="/signup" className="bb-cta bb-mkt-final-cta">
            Start 7-day free trial
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="bb-mkt-final-sub">
            7 days free &middot; no card required &middot; cancel anytime
          </p>
        </div>
      </section>

      {/* ── MARKETING FOOTER ──────────────────────────────────────── */}
      <footer className="bb-mkt-footer" aria-label="Site footer">
        <div className="bb-mkt-container bb-mkt-footer-inner">
          <div className="bb-mkt-footer-brand">
            <div className="bb-mkt-footer-brand-row">
              <Image
                src="/bb-logo-mark.png"
                alt=""
                width={1024}
                height={1024}
                sizes="48px"
                className="bb-mkt-footer-mark"
              />
              <span className="bb-mkt-footer-brand-text">Bite Book</span>
            </div>
            <p className="bb-mkt-footer-tag">
              The digital log book for hunting and fishing guides. A Last Bite Pro
              product.
            </p>
            <a
              href="mailto:support@lastbite.pro"
              className="bb-mkt-footer-support"
            >
              <Mail size={14} aria-hidden="true" />
              support@lastbite.pro
            </a>
          </div>
          <div className="bb-mkt-footer-cols">
            <FooterCol
              heading="Product"
              links={[
                { label: 'Sign up', href: '/signup' },
                { label: 'Sign in', href: '/login' },
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
        <div className="bb-mkt-footer-bottom">
          © 2026 Bite Book &middot; Field-tested for guides and hunters
        </div>
      </footer>

      <style>{`
        .bb-mkt { display: block; color: var(--color-ink); }

        /* ── HERO ───────────────────────────────────────────────── */
        .bb-hero { min-height: 78vh; }
        @media (min-width: 768px) { .bb-hero { min-height: 82vh; } }

        .bb-mkt-hero-inner {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          text-align: center;
          padding: 3rem 1.5rem 4rem;
          max-width: 56rem;
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .bb-mkt-hero-inner { padding: 4.5rem 2rem 5rem; gap: 0.85rem; }
        }
        .bb-mkt-hero-mark-link { display: inline-flex; }
        .bb-mkt-hero-mark {
          width: 80px; height: 80px;
        }
        @media (min-width: 768px) {
          .bb-mkt-hero-mark { width: 96px; height: 96px; }
        }

        .bb-mkt-eyebrow {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: rgba(244, 239, 229, 0.55);
          margin: 0.25rem 0 0;
        }

        .bb-mkt-hero-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(2.4rem, 8.5vw, 4.6rem);
          line-height: 1.02;
          color: #FFFFFF;
          margin: 0.6rem 0 0.5rem;
          letter-spacing: 0.005em;
        }
        .bb-mkt-hero-title-accent {
          color: var(--color-copper);
        }

        .bb-mkt-hero-sub {
          font-family: var(--font-barlow);
          font-size: 1.05rem;
          line-height: 1.55;
          color: rgba(244, 239, 229, 0.85);
          margin: 0 auto;
          max-width: 36rem;
        }
        @media (min-width: 768px) {
          .bb-mkt-hero-sub { font-size: 1.18rem; max-width: 44rem; }
        }

        .bb-mkt-hero-cta-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.85rem;
          margin-top: 1.5rem;
          width: 100%;
          max-width: 22rem;
        }
        @media (min-width: 768px) {
          .bb-mkt-hero-cta-row { flex-direction: row; max-width: none; gap: 1.5rem; margin-top: 2rem; }
        }
        .bb-mkt-cta-primary { width: 100%; }
        @media (min-width: 768px) {
          .bb-mkt-cta-primary {
            width: auto;
            padding-left: 2.5rem;
            padding-right: 2.5rem;
          }
        }
        .bb-mkt-secondary-link {
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          color: rgba(244, 239, 229, 0.78);
          text-decoration: none;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .bb-mkt-secondary-link:hover { color: #FFFFFF; }

        .bb-mkt-trust-row {
          list-style: none;
          padding: 0;
          margin: 1.5rem 0 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem 1rem;
        }
        @media (min-width: 768px) {
          .bb-mkt-trust-row { margin-top: 2.25rem; gap: 0.5rem 1.5rem; }
        }
        .bb-mkt-trust-row li {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(244, 239, 229, 0.7);
        }
        .bb-mkt-trust-row svg { color: var(--color-copper); }

        /* ── SECTIONS ───────────────────────────────────────────── */
        .bb-mkt-section { padding: 4rem 1.25rem; }
        @media (min-width: 768px) { .bb-mkt-section { padding: 6rem 2rem; } }
        .bb-mkt-section-paper { background: var(--color-paper); color: var(--color-ink); }
        .bb-mkt-section-dark { background: var(--color-page-bg); color: #F4EFE5; }
        .bb-mkt-container { max-width: 1080px; margin: 0 auto; }
        .bb-mkt-container-narrow { max-width: 720px; }

        .bb-mkt-section-eyebrow {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--color-copper);
          margin: 0 0 0.75rem;
        }
        .bb-mkt-section-eyebrow-dark { color: #D89169; }
        .bb-mkt-section-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(1.95rem, 5vw, 2.85rem);
          line-height: 1.08;
          letter-spacing: 0.005em;
          margin: 0 0 1.5rem;
          color: var(--color-ink);
        }
        .bb-mkt-section-title-dark { color: #FFFFFF; }
        .bb-mkt-section-sub {
          font-family: var(--font-barlow);
          font-size: 1.05rem;
          color: var(--color-ink-soft);
          margin: 0 0 2rem;
          max-width: 36rem;
        }

        /* ── PILLARS ────────────────────────────────────────────── */
        .bb-mkt-pillars {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          margin-top: 0.5rem;
        }
        @media (min-width: 640px) {
          .bb-mkt-pillars { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
        }
        @media (min-width: 1024px) {
          .bb-mkt-pillars { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
        }
        .bb-mkt-pillar {
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 16px;
          padding: 1.5rem;
          transition: transform 200ms, border-color 200ms, box-shadow 200ms;
        }
        .bb-mkt-pillar:hover {
          border-color: rgba(176, 108, 60, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 18px 36px rgba(11, 8, 6, 0.08);
        }
        .bb-mkt-pillar-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.6rem;
          height: 2.6rem;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--color-copper), #8C5530);
          color: #FFFFFF;
          margin-bottom: 1rem;
          box-shadow: 0 4px 12px rgba(176, 108, 60, 0.25);
        }
        .bb-mkt-pillar-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.25rem;
          line-height: 1.15;
          margin: 0 0 0.5rem;
          color: var(--color-ink);
          letter-spacing: 0.005em;
        }
        .bb-mkt-pillar-body {
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          line-height: 1.55;
          color: var(--color-ink-muted);
          margin: 0;
        }

        /* ── STEPS ──────────────────────────────────────────────── */
        .bb-mkt-steps {
          list-style: none;
          padding: 0;
          margin: 1rem 0 0;
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }
        @media (min-width: 1024px) {
          .bb-mkt-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.75rem; }
        }
        .bb-mkt-step {
          background: rgba(244, 239, 229, 0.04);
          border: 1px solid rgba(244, 239, 229, 0.1);
          border-radius: 16px;
          padding: 1.75rem 1.5rem;
          position: relative;
        }
        .bb-mkt-step-num-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 1rem;
        }
        .bb-mkt-step-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.4rem;
          height: 2.4rem;
          border-radius: 999px;
          background: var(--color-copper);
          color: #FFFFFF;
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.1rem;
          flex-shrink: 0;
        }
        .bb-mkt-step-icon {
          color: rgba(244, 239, 229, 0.45);
        }
        .bb-mkt-step-title {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.4rem;
          line-height: 1.15;
          margin: 0 0 0.4rem;
          color: #FFFFFF;
          letter-spacing: 0.005em;
        }
        .bb-mkt-step-body {
          font-family: var(--font-barlow);
          font-size: 0.98rem;
          line-height: 1.55;
          color: rgba(244, 239, 229, 0.78);
          margin: 0;
        }

        /* ── PRICING ────────────────────────────────────────────── */
        .bb-mkt-price-card {
          position: relative;
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 18px;
          padding: 2.5rem 1.75rem 2rem;
          margin-top: 1.75rem;
          box-shadow: 0 24px 48px rgba(11, 8, 6, 0.1);
        }
        @media (min-width: 768px) { .bb-mkt-price-card { padding: 3rem 2.5rem 2.25rem; } }
        .bb-mkt-price-tag {
          position: absolute;
          top: -0.85rem;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, var(--color-copper), #8C5530);
          color: #FFFFFF;
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          padding: 0.4rem 0.95rem;
          border-radius: 999px;
          box-shadow: 0 6px 18px rgba(176, 108, 60, 0.4);
          white-space: nowrap;
        }
        .bb-mkt-price-toggle {
          display: inline-flex;
          gap: 0;
          padding: 0.3rem;
          border-radius: 999px;
          background: rgba(176, 108, 60, 0.08);
          margin: 0.25rem 0 1.5rem;
        }
        .bb-mkt-price-toggle-pill {
          padding: 0.45rem 1rem;
          border-radius: 999px;
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--color-ink-muted);
          transition: background 200ms, color 200ms;
        }
        .bb-mkt-price-toggle-pill.is-active {
          background: var(--color-copper);
          color: #FFFFFF;
        }
        .bb-mkt-price-amount-row {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .bb-mkt-price-amount {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(3rem, 9vw, 4rem);
          line-height: 1;
          color: var(--color-ink);
          letter-spacing: -0.005em;
        }
        .bb-mkt-price-period {
          font-family: var(--font-barlow);
          font-size: 1.1rem;
          color: var(--color-ink-soft);
        }
        .bb-mkt-price-equivalence {
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          color: var(--color-ink-muted);
          margin: 0.5rem 0 0;
        }
        .bb-mkt-price-equivalence strong { color: var(--color-ink); font-weight: 600; }
        .bb-mkt-price-monthly-alt {
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: var(--color-ink-soft);
          margin: 0.85rem 0 0;
        }
        .bb-mkt-price-monthly-alt strong { color: var(--color-ink); font-weight: 600; }
        .bb-mkt-price-features {
          list-style: none;
          padding: 0;
          margin: 1.5rem 0 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .bb-mkt-price-features li {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-family: var(--font-barlow);
          font-size: 0.95rem;
          color: var(--color-ink);
        }
        .bb-mkt-price-features li svg { color: var(--color-copper); flex-shrink: 0; }
        .bb-mkt-price-cta { width: 100%; }
        .bb-mkt-price-fineprint {
          text-align: center;
          font-family: var(--font-barlow);
          font-size: 0.85rem;
          color: var(--color-ink-soft);
          margin: 0.95rem 0 0;
        }

        /* ── FAQ ────────────────────────────────────────────────── */
        .bb-mkt-section-faq { padding-top: 3rem; }
        @media (min-width: 768px) { .bb-mkt-section-faq { padding-top: 4rem; } }
        .bb-mkt-faq {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .bb-mkt-faq-item {
          background: #FFFFFF;
          border: 1px solid var(--color-card-divider);
          border-radius: 14px;
          padding: 0;
          overflow: hidden;
          transition: border-color 200ms;
        }
        .bb-mkt-faq-item[open] { border-color: rgba(176, 108, 60, 0.4); }
        .bb-mkt-faq-item summary {
          padding: 1.05rem 1.25rem;
          cursor: pointer;
          font-family: var(--font-barlow);
          font-weight: 600;
          font-size: 1.02rem;
          color: var(--color-ink);
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .bb-mkt-faq-item summary::-webkit-details-marker { display: none; }
        .bb-mkt-faq-item summary::after {
          content: '+';
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.55rem;
          color: var(--color-copper);
          line-height: 1;
        }
        .bb-mkt-faq-item[open] summary::after { content: '−'; }
        .bb-mkt-faq-body {
          padding: 0 1.25rem 1.1rem;
          font-family: var(--font-barlow);
          font-size: 0.97rem;
          line-height: 1.6;
          color: var(--color-ink-muted);
        }
        .bb-mkt-faq-foot {
          margin: 1.75rem 0 0;
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: var(--color-ink-soft);
          text-align: center;
        }
        .bb-mkt-inline-link {
          color: var(--color-copper);
          text-decoration: underline;
          font-weight: 600;
        }

        /* ── FINAL CTA ──────────────────────────────────────────── */
        .bb-mkt-final { padding-top: 4.5rem; padding-bottom: 4.5rem; }
        @media (min-width: 768px) { .bb-mkt-final { padding-top: 5.5rem; padding-bottom: 5.5rem; } }
        .bb-mkt-final-headline {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: clamp(2rem, 5.5vw, 3rem);
          line-height: 1.08;
          margin: 0 0 0.85rem;
          color: #FFFFFF;
          letter-spacing: 0.005em;
        }
        .bb-mkt-final-sub-top {
          font-family: var(--font-barlow);
          font-size: 1.05rem;
          color: rgba(244, 239, 229, 0.78);
          margin: 0 0 2rem;
        }
        .bb-mkt-final-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          width: auto;
          padding-left: 2.25rem;
          padding-right: 2.25rem;
        }
        .bb-mkt-final-sub {
          margin: 1.1rem 0 0;
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: rgba(244, 239, 229, 0.55);
        }

        /* ── FOOTER ─────────────────────────────────────────────── */
        .bb-mkt-footer {
          background: #07050a;
          color: rgba(244, 239, 229, 0.78);
          padding: 3.5rem 1.25rem 1.5rem;
        }
        @media (min-width: 768px) { .bb-mkt-footer { padding: 4.5rem 2rem 1.75rem; } }
        .bb-mkt-footer-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2.5rem;
        }
        @media (min-width: 768px) {
          .bb-mkt-footer-inner { grid-template-columns: 1.2fr 2fr; gap: 3.5rem; }
        }
        .bb-mkt-footer-brand {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .bb-mkt-footer-brand-row { display: flex; align-items: center; gap: 0.7rem; }
        .bb-mkt-footer-mark { width: 40px; height: 40px; }
        .bb-mkt-footer-brand-text {
          font-family: var(--font-barlow-condensed);
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: 0.04em;
          color: #FFFFFF;
          text-transform: uppercase;
        }
        .bb-mkt-footer-tag {
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: rgba(244, 239, 229, 0.55);
          margin: 0;
          max-width: 24rem;
          line-height: 1.55;
        }
        .bb-mkt-footer-support {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: rgba(244, 239, 229, 0.78);
          text-decoration: none;
        }
        .bb-mkt-footer-support:hover { color: #FFFFFF; }
        .bb-mkt-footer-support svg { color: var(--color-copper); }

        .bb-mkt-footer-cols {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
        }
        @media (max-width: 480px) {
          .bb-mkt-footer-cols { grid-template-columns: 1fr 1fr; gap: 1.5rem; }
          .bb-mkt-footer-cols > :nth-child(3) { grid-column: span 2; }
        }
        .bb-mkt-footer-col-heading {
          font-family: var(--font-barlow-condensed);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(244, 239, 229, 0.55);
          margin: 0 0 0.85rem;
        }
        .bb-mkt-footer-col-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .bb-mkt-footer-col-list a {
          font-family: var(--font-barlow);
          font-size: 0.92rem;
          color: rgba(244, 239, 229, 0.78);
          text-decoration: none;
        }
        .bb-mkt-footer-col-list a:hover { color: #FFFFFF; }
        .bb-mkt-footer-bottom {
          margin-top: 2.75rem;
          padding-top: 1.4rem;
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
  icon: typeof PenLine
  title: string
  body: string
}) {
  return (
    <article className="bb-mkt-pillar">
      <span className="bb-mkt-pillar-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <h3 className="bb-mkt-pillar-title">{title}</h3>
      <p className="bb-mkt-pillar-body" dangerouslySetInnerHTML={{ __html: body }} />
    </article>
  )
}

function Step({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: number
  icon: typeof Mail
  title: string
  body: string
}) {
  return (
    <li className="bb-mkt-step">
      <div className="bb-mkt-step-num-row">
        <span className="bb-mkt-step-num" aria-hidden="true">
          {n}
        </span>
        <Icon size={22} className="bb-mkt-step-icon" aria-hidden="true" />
      </div>
      <h3 className="bb-mkt-step-title">{title}</h3>
      <p className="bb-mkt-step-body">{body}</p>
    </li>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="bb-mkt-faq-item">
      <summary>{q}</summary>
      <div className="bb-mkt-faq-body">{children}</div>
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
      <p className="bb-mkt-footer-col-heading">{heading}</p>
      <ul className="bb-mkt-footer-col-list">
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
