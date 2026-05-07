import Link from 'next/link'
import { Mail } from 'lucide-react'
import { requireHunter } from '../../_lib/auth'
import HelpSearch from '../../_components/HelpSearch'
import { categoriesForAudience } from '@/lib/help/categories'
import { articlesForAudience, buildSearchIndex } from '@/lib/help/articles'

// v27.9.5b — Hunter Help Center landing. Same shape as the guide
// version but the audience filter excludes guide-only articles
// (per Flavio's confirmed answer in the v27.9.5 plan). Hunters see
// only categories tagged 'hunter' or 'both'.
export default async function HunterSupportPage() {
  const { profile } = await requireHunter()
  const displayName = profile.display_name ?? 'Hunter'
  const subject = encodeURIComponent(`Bite Book support - ${displayName}`)
  const mailto = `mailto:support@lastbite.pro?subject=${subject}`

  const categories = categoriesForAudience('hunter')
  const articles = articlesForAudience('hunter')
  const recent = articles.slice(0, 6)
  const articleCountByCategory = new Map<string, number>()
  for (const a of articles) {
    articleCountByCategory.set(a.category, (articleCountByCategory.get(a.category) ?? 0) + 1)
  }
  const searchIndex = buildSearchIndex('hunter')

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Help center</p>
        <h1 className="bb-page-title">Help</h1>
        <p className="bb-page-sub">
          Search for an answer, browse a topic, or email us if you&rsquo;re stuck.
        </p>
      </header>

      <div className="bb-help-shell">
        <HelpSearch index={searchIndex} />

        <section className="bb-help-section">
          <h2 className="bb-help-h2">Browse by topic</h2>
          <ul className="bb-help-chips">
            {categories.map((c) => {
              const count = articleCountByCategory.get(c.slug) ?? 0
              return (
                <li key={c.slug}>
                  <Link
                    href={`/app/h/support#cat-${c.slug}`}
                    className="bb-help-chip"
                    aria-label={`${c.title} — ${count} ${count === 1 ? 'article' : 'articles'}`}
                  >
                    <span className="bb-help-chip-title">{c.title}</span>
                    <span className="bb-help-chip-count">{count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {recent.length > 0 && (
          <section className="bb-help-section">
            <h2 className="bb-help-h2">Most recent</h2>
            <ul className="bb-help-grid">
              {recent.map((a) => (
                <li key={a.slug}>
                  <Link href={`/app/h/support/${a.slug}`} className="bb-help-card">
                    <span className="bb-help-card-title">{a.title}</span>
                    {a.excerpt && (
                      <span className="bb-help-card-excerpt">{a.excerpt}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {categories.map((c) => {
          const inCat = articles.filter((a) => a.category === c.slug)
          if (inCat.length === 0) return null
          return (
            <section key={c.slug} id={`cat-${c.slug}`} className="bb-help-section">
              <h2 className="bb-help-h2">{c.title}</h2>
              <p className="bb-help-section-sub">{c.description}</p>
              <ul className="bb-help-grid">
                {inCat.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/app/h/support/${a.slug}`} className="bb-help-card">
                      <span className="bb-help-card-title">{a.title}</span>
                      {a.excerpt && (
                        <span className="bb-help-card-excerpt">{a.excerpt}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section className="bb-help-section">
          <div className="bb-tile">
            <div className="bb-tile-body bb-help-fallback">
              <div>
                <h3 className="bb-help-fallback-title">Still stuck?</h3>
                <p className="bb-help-fallback-body">
                  Email us. We answer most messages within a business day.
                </p>
              </div>
              <a href={mailto} className="bb-cta-sm inline-flex">
                <Mail size={14} aria-hidden="true" />
                Email support
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
