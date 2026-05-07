'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Fuse, { type IFuseOptions } from 'fuse.js'
import { Search, X } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/articles'

// v27.9.5b — Help Center search. Receives the prebuilt index from the
// landing-page server component, runs fuzzy match in the browser via
// Fuse.js. Search scope is title + first paragraph (excerpt) + tags
// per Flavio's confirmed answer. No network calls; the index is
// shipped inline with the page (~150 bytes per article).

const FUSE_OPTIONS: IFuseOptions<HelpSearchEntry> = {
  keys: [
    { name: 'title', weight: 0.55 },
    { name: 'tags', weight: 0.25 },
    { name: 'excerpt', weight: 0.2 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

export default function HelpSearch({ index }: { index: HelpSearchEntry[] }) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => new Fuse(index, FUSE_OPTIONS), [index])
  const trimmed = query.trim()
  const results = trimmed ? fuse.search(trimmed).slice(0, 8).map((r) => r.item) : []

  return (
    <div className="bb-help-search">
      <div className="bb-help-search-input">
        <Search size={18} aria-hidden="true" className="bb-help-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          autoComplete="off"
          className="bb-help-search-field"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="bb-help-search-clear"
            aria-label="Clear search"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {trimmed && (
        <div className="bb-help-search-results" role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <p className="bb-help-search-empty">
              No articles match &ldquo;{trimmed}&rdquo;. Email{' '}
              <a href="mailto:support@lastbite.pro" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>
                support@lastbite.pro
              </a>{' '}
              and we&rsquo;ll get you sorted.
            </p>
          ) : (
            <ul className="bb-help-search-list">
              {results.map((r) => (
                <li key={r.slug}>
                  <Link href={r.href} className="bb-help-search-result">
                    <span className="bb-help-search-result-title">{r.title}</span>
                    {r.excerpt && (
                      <span className="bb-help-search-result-excerpt">{r.excerpt}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
