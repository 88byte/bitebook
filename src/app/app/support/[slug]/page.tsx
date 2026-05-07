import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail } from 'lucide-react'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { requireGuide } from '../../_lib/auth'
import { articlesForAudience, getArticleBySlug } from '@/lib/help/articles'
import { getCategory } from '@/lib/help/categories'

// v27.9.5b — Help article detail (guide view). MDX rendered server-side
// via next-mdx-remote/rsc. Audience filter excludes hunter-only articles
// from this route. Static-generated at build time for every article via
// generateStaticParams so production serves them as plain HTML.

export async function generateStaticParams() {
  return articlesForAudience('guide').map((a) => ({ slug: a.slug }))
}

export const dynamicParams = false

export default async function GuideHelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requireGuide()
  const { slug } = await params
  const article = getArticleBySlug(slug, 'guide')
  if (!article) notFound()
  const category = getCategory(article.category)
  const related = (article.related ?? [])
    .map((s) => getArticleBySlug(s, 'guide'))
    .filter((a): a is NonNullable<typeof a> => a !== null)

  return (
    <main className="bb-app-main">
      <Link href="/app/support" className="bb-text-action" style={{ marginBottom: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <ArrowLeft size={14} aria-hidden="true" /> All help articles
      </Link>

      <header>
        {category && <p className="bb-page-eyebrow">{category.title}</p>}
        <h1 className="bb-page-title">{article.title}</h1>
        {article.last_updated && (
          <p className="bb-page-sub" style={{ fontSize: '0.85rem' }}>
            Updated {article.last_updated}
          </p>
        )}
      </header>

      <article className="bb-help-article">
        <MDXRemote source={article.body} />
      </article>

      {related.length > 0 && (
        <section className="bb-help-section">
          <h2 className="bb-help-h2">Related</h2>
          <ul className="bb-help-grid">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/app/support/${r.slug}`} className="bb-help-card">
                  <span className="bb-help-card-title">{r.title}</span>
                  {r.excerpt && (
                    <span className="bb-help-card-excerpt">{r.excerpt}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bb-help-section">
        <div className="bb-tile">
          <div className="bb-tile-body bb-help-fallback">
            <div>
              <h3 className="bb-help-fallback-title">Didn&rsquo;t answer your question?</h3>
              <p className="bb-help-fallback-body">
                Email us at support@lastbite.pro. Same-day reply, usually faster.
              </p>
            </div>
            <a href="mailto:support@lastbite.pro" className="bb-cta-sm inline-flex">
              <Mail size={14} aria-hidden="true" />
              Email support
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
