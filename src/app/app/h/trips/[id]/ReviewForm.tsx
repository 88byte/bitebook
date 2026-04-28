'use client'

import { useState, useTransition } from 'react'
import { Star, Pencil, Check } from 'lucide-react'
import { submitTripReviewAction } from './actions'

export type ReviewFormProps = {
  tripId: string
  existingReview: {
    id: string
    rating: number
    comment: string | null
    created_at: string
    updated_at: string
  } | null
  canEdit: boolean
}

// v26.0 Batch A: 5-star + comment form for completed trips. Three modes:
//   1. No existing review → prompt + form
//   2. Existing review, can edit → collapsed display with Edit button
//      (clicking expands the form pre-filled)
//   3. Existing review, cannot edit (>7d) → read-only display only
export default function ReviewForm({ tripId, existingReview, canEdit }: ReviewFormProps) {
  const [editing, setEditing] = useState(!existingReview)
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0)
  const [comment, setComment] = useState<string>(existingReview?.comment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState(0)
  const [isPending, startTransition] = useTransition()

  const showSaved = savedAt !== null && Date.now() - savedAt < 4000
  const charLeft = 500 - comment.length

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (rating < 1 || rating > 5) {
      setError('Pick a rating from 1 to 5.')
      return
    }
    const fd = new FormData()
    fd.set('trip_id', tripId)
    fd.set('rating', String(rating))
    fd.set('comment', comment)

    startTransition(async () => {
      const res = await submitTripReviewAction(fd)
      if ('error' in res) {
        setError(res.error)
      } else {
        setSavedAt(Date.now())
        // After submit, drop back into read-only display after a beat.
        setTimeout(() => setEditing(false), 1200)
      }
    })
  }

  // Display-only block (existing review, not currently editing)
  if (existingReview && !editing) {
    return (
      <section aria-labelledby="trip-review">
        <h2 id="trip-review" className="bb-section-title">Your review</h2>
        <div className="bb-tile">
          <div className="bb-tile-body">
            <StarRow rating={existingReview.rating} />
            {existingReview.comment && (
              <p
                className="text-sm whitespace-pre-wrap mt-2"
                style={{ color: 'var(--color-ink-muted)' }}
              >
                {existingReview.comment}
              </p>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="bb-text-action bb-text-action-copper mt-2 inline-flex items-center gap-1"
                style={{ padding: 0, fontSize: '0.85rem' }}
              >
                <Pencil size={12} aria-hidden="true" />
                Edit review
              </button>
            )}
            {!canEdit && (
              <p className="bb-form-help mt-2">Reviews can be edited for 7 days after posting.</p>
            )}
          </div>
        </div>
      </section>
    )
  }

  // Editor (no review yet, or editing an existing one)
  return (
    <section aria-labelledby="trip-review">
      <h2 id="trip-review" className="bb-section-title">
        {existingReview ? 'Edit your review' : 'How was your trip?'}
      </h2>
      <div className="bb-tile">
        <div className="bb-tile-body">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="bb-form-row">
              <span className="bb-form-label">Rating</span>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = (hoverRating || rating) >= n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`Rate ${n} ${n === 1 ? 'star' : 'stars'}`}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onFocus={() => setHoverRating(n)}
                      onBlur={() => setHoverRating(0)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '0.4rem',
                        cursor: 'pointer',
                        color: filled ? 'var(--color-copper)' : 'var(--color-ink-soft)',
                        minWidth: 44,
                        minHeight: 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Star
                        size={28}
                        aria-hidden="true"
                        fill={filled ? 'currentColor' : 'none'}
                        strokeWidth={1.75}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="review_comment">Comment (optional)</label>
              <textarea
                id="review_comment"
                name="comment"
                className="bb-input"
                rows={4}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything you want to share with your guide?"
              />
              <p className="bb-form-help">{charLeft} characters left</p>
            </div>

            {error && (
              <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" className="bb-cta-sm" disabled={isPending || rating < 1}>
                {isPending ? 'Saving...' : existingReview ? 'Update review' : 'Submit review'}
              </button>
              {existingReview && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setRating(existingReview.rating)
                    setComment(existingReview.comment ?? '')
                    setError(null)
                  }}
                  className="bb-text-action bb-text-action-copper"
                  style={{ padding: 0, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              )}
              {showSaved && (
                <span
                  className="bb-pill bb-pill-active"
                  role="status"
                  aria-live="polite"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Check size={12} aria-hidden="true" />
                  Thanks for your review
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rating
        return (
          <Star
            key={n}
            size={20}
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
