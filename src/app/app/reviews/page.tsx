import Link from 'next/link'
import { Star, FileText } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchGuideReviews, fetchGuideReviewStats } from '../_lib/queries'
import type { ReviewSort } from '../_lib/queries'
import { initials, relativeOrDate } from '../_lib/format'
import SortSelect from './SortSelect'

type SearchParams = Promise<{ sort?: string }>

const SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: 'recent',  label: 'Most recent' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'highest', label: 'Highest rating' },
  { value: 'lowest',  label: 'Lowest rating' },
]

function isReviewSort(s: string | undefined): s is ReviewSort {
  return s === 'recent' || s === 'oldest' || s === 'highest' || s === 'lowest'
}

// v26.0 Batch A: guide-side reviews dashboard. Shows aggregate average,
// distribution histogram, and a sorted list of every review on this guide's
// trips. RLS guarantees we only see our own.
export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const sp = await searchParams
  const sort: ReviewSort = isReviewSort(sp.sort) ? sp.sort : 'recent'

  const [reviews, stats] = await Promise.all([
    fetchGuideReviews(profile.id, sort),
    fetchGuideReviewStats(profile.id),
  ])

  const isEmpty = stats.count === 0

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Feedback</p>
        <h1 className="bb-page-title">Reviews</h1>
        <p className="bb-page-sub">
          {isEmpty
            ? 'No reviews yet.'
            : `${stats.count} ${stats.count === 1 ? 'review' : 'reviews'} from your hunters.`}
        </p>
      </header>

      <div className="bb-form-narrow">
        {isEmpty ? (
          <section className="bb-tile mt-4">
            <div className="bb-tile-body">
              <div className="bb-empty">
                <FileText size={28} aria-hidden="true" style={{ color: 'var(--color-ink-soft)' }} />
                <div className="bb-empty-title mt-2">No reviews yet</div>
                <p className="bb-empty-sub">
                  Once hunters leave reviews after their trips, they will appear here.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="bb-tile mt-4" aria-labelledby="reviews-summary">
              <div className="bb-tile-body">
                <h2 id="reviews-summary" className="sr-only">Review summary</h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '1.25rem',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '5rem' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-barlow-condensed)',
                        fontWeight: 800,
                        fontSize: '3rem',
                        lineHeight: 1,
                        color: 'var(--color-ink)',
                      }}
                    >
                      {stats.average.toFixed(1)}
                    </div>
                    <div style={{ marginTop: '0.35rem' }}>
                      <StarRow rating={Math.round(stats.average)} size={16} />
                    </div>
                    <div className="bb-stat-label" style={{ marginTop: '0.4rem' }}>
                      {stats.count} {stats.count === 1 ? 'review' : 'reviews'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {[5, 4, 3, 2, 1].map((n) => {
                      const count = stats.distribution[n - 1]
                      const pct = stats.count > 0 ? (count / stats.count) * 100 : 0
                      return (
                        <div
                          key={n}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.25rem 1fr 2.25rem',
                            gap: '0.5rem',
                            alignItems: 'center',
                            fontSize: '0.8rem',
                          }}
                        >
                          <span style={{ color: 'var(--color-ink-soft)', fontWeight: 600 }}>{n}</span>
                          <div
                            style={{
                              height: 8,
                              background: 'var(--color-card-divider)',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                            aria-hidden="true"
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: 'var(--color-copper)',
                              }}
                            />
                          </div>
                          <span style={{ color: 'var(--color-ink-soft)', textAlign: 'right' }}>
                            {count}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* v27.3.3.1: divider above All reviews so the section
                separates cleanly from the summary card above. */}
            <div className="bb-page-divider mt-4" aria-hidden="true" />

            <section className="mt-4" aria-labelledby="reviews-list">
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: '0.75rem' }}
              >
                <h2 id="reviews-list" className="bb-section-title" style={{ margin: 0 }}>
                  All reviews
                </h2>
                <SortSelect value={sort} options={SORT_OPTIONS} />
              </div>

              <div className="flex flex-col gap-3">
                {reviews.map((r) => {
                  const hunterName = r.hunter?.display_name ?? 'Hunter'
                  return (
                    <article key={r.id} className="bb-tile">
                      <div className="bb-tile-body">
                        <div className="flex items-start gap-3">
                          <span className="bb-avatar" aria-hidden="true">{initials(hunterName)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="bb-detail-name">{hunterName}</span>
                              <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.8rem' }}>
                                {relativeOrDate(r.created_at)}
                              </span>
                            </div>
                            <div style={{ marginTop: '0.25rem' }}>
                              <StarRow rating={r.rating} size={14} />
                            </div>
                            {r.comment && (
                              <p
                                className="text-sm whitespace-pre-wrap mt-2"
                                style={{ color: 'var(--color-ink-muted)' }}
                              >
                                {r.comment}
                              </p>
                            )}
                            {r.trip && (
                              <Link
                                href={`/app/trips/${r.trip.id}`}
                                className="bb-text-action bb-text-action-copper mt-2 inline-flex"
                                style={{ padding: 0, fontSize: '0.85rem' }}
                              >
                                View trip: {r.trip.title}
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function StarRow({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 2 }}
      aria-label={`Rated ${rating} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rating
        return (
          <Star
            key={n}
            size={size}
            aria-hidden="true"
            fill={filled ? 'currentColor' : 'none'}
            strokeWidth={1.75}
            style={{ color: filled ? 'var(--color-copper)' : 'var(--color-ink-soft)' }}
          />
        )
      })}
    </div>
  )
}
