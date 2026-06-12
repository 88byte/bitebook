// v28.1.0f.1 — pure-function unit tests for the trip conflict
// detector overlap math. Run with: node scripts/test-trip-conflicts.mjs
//
// We re-implement the two helpers inline (instead of importing the
// TS source) so the test runs without a TypeScript compiler. The
// math has to stay byte-identical with trip-conflicts.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const OPEN_ENDED_MS = 24 * 60 * 60 * 1000

function toInterval(starts_at, ends_at) {
  const startMs = new Date(starts_at).getTime()
  const endMs =
    ends_at != null
      ? new Date(ends_at).getTime()
      : startMs + OPEN_ENDED_MS
  if (endMs <= startMs) return { startMs, endMs: startMs + OPEN_ENDED_MS }
  return { startMs, endMs }
}

function intervalsOverlap(a, b) {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

// Helper: shorthand iso strings.
const t = (h, day = 1) => `2026-07-0${day}T${String(h).padStart(2, '0')}:00:00Z`

test('toInterval treats null ends_at as start + 24h', () => {
  const iv = toInterval(t(8), null)
  assert.equal(iv.endMs - iv.startMs, OPEN_ENDED_MS)
})

test('toInterval guards against ends_at <= starts_at by treating as open-ended', () => {
  const iv = toInterval(t(10), t(8))
  assert.equal(iv.endMs - iv.startMs, OPEN_ENDED_MS)
})

test('full overlap: same window', () => {
  const a = toInterval(t(8), t(12))
  const b = toInterval(t(8), t(12))
  assert.equal(intervalsOverlap(a, b), true)
})

test('partial overlap: b starts inside a', () => {
  const a = toInterval(t(8), t(12))
  const b = toInterval(t(10), t(14))
  assert.equal(intervalsOverlap(a, b), true)
})

test('partial overlap: a starts inside b', () => {
  const a = toInterval(t(10), t(14))
  const b = toInterval(t(8), t(12))
  assert.equal(intervalsOverlap(a, b), true)
})

test('touching at boundary is NOT an overlap (half-open semantics)', () => {
  const a = toInterval(t(8), t(12))
  const b = toInterval(t(12), t(14))
  assert.equal(intervalsOverlap(a, b), false)
})

test('a contains b', () => {
  const a = toInterval(t(8), t(20))
  const b = toInterval(t(10), t(12))
  assert.equal(intervalsOverlap(a, b), true)
})

test('b contains a', () => {
  const a = toInterval(t(10), t(12))
  const b = toInterval(t(8), t(20))
  assert.equal(intervalsOverlap(a, b), true)
})

test('disjoint windows do not overlap', () => {
  const a = toInterval(t(8), t(10))
  const b = toInterval(t(12), t(14))
  assert.equal(intervalsOverlap(a, b), false)
})

test('open-ended trip vs short trip the same day overlaps', () => {
  const a = toInterval(t(8), null)
  const b = toInterval(t(20), t(22))
  assert.equal(intervalsOverlap(a, b), true)
})

test('open-ended trip vs next-day short trip does not overlap', () => {
  const a = toInterval(t(8, 1), null) // 24h slot on day 1
  const b = toInterval(t(8, 2), t(10, 2)) // day 2 morning
  assert.equal(intervalsOverlap(a, b), false)
})

test('two open-ended trips on different days do not overlap', () => {
  const a = toInterval(t(8, 1), null)
  const b = toInterval(t(8, 3), null)
  assert.equal(intervalsOverlap(a, b), false)
})

test('two open-ended trips on the same day overlap', () => {
  const a = toInterval(t(8, 1), null)
  const b = toInterval(t(10, 1), null)
  assert.equal(intervalsOverlap(a, b), true)
})
