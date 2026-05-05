// v27.7.0 — IndexedDB schema scaffold for the offline-first active-week
// data layer. This file defines the schema + a typed openDB() wrapper.
// NO consumer wires it up in this ship — it's purely additive
// scaffolding so subsequent ships (v27.7.0.1 read-through, v27.7.0.2
// outbox + write-through) can import a stable typed surface from day 1.
//
// SSR safety: every access through `getDb()` checks `typeof indexedDB`
// and returns null on the server. The module itself is safe to import
// from server contexts because the actual `openDB()` call is deferred
// inside the function. Always gate IDB consumers with the returned
// nullable + the `'use client'` directive on the calling component.
//
// Schema mirrors §2 of the v27.7.0 plan (object stores keyed by
// Supabase primary UUID where applicable). Indexes match common access
// patterns we already use in queries.ts / harvest-log-queries.ts so a
// later read-through hook can drop in without re-shaping.

import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'

import type { Database } from '@/lib/supabase/types'

type DB = Database['public']['Tables']
type Row<T extends keyof DB> = DB[T]['Row']

// Local-only outbox row. Mirrors the offline_outbox table shape but
// adds client-side tracking fields (status, retries, last_error_at).
// Server sync drains by `status='pending'` ordered by `created_at`.
export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'done'
export type OutboxEntry = {
  id: string
  user_id: string
  table_name: string
  operation: string
  payload: unknown
  status: OutboxStatus
  attempts: number
  created_at: string
  last_attempt_at: string | null
  last_error: string | null
  // Optional reference to the local entity row this outbox entry mutates.
  // Drives the "Pending sync" pill UI (which rows still have unflushed edits).
  entity_store: string | null
  entity_id: string | null
}

// Singleton local-only stores (key/value blobs).
export type MetaKey =
  | 'schema_version'
  | 'last_precache_at'
  | 'last_sync_at'
  | 'guide_id'
  | 'feature_flags'

export type SignatureStoreRow = {
  id: 'default'
  data_url: string
  updated_at: string
}

export type CachedPdfTemplateMeta = {
  doc_id: string
  cache_key: string // URL key in the bitebook-pdf-templates Cache Storage entry
  fetched_at: string
  source_url: string | null
  source_url_expires_at: string | null
}

export interface BitebookDB extends DBSchema {
  meta: {
    key: MetaKey
    value: { key: MetaKey; value: unknown; updated_at: string }
  }
  trips: {
    key: string
    value: Row<'trips'>
    indexes: {
      by_status: string
      by_starts_at: string
      // Active-window flag, set during precache. 1 = inside window, 0 = stale.
      // We pre-flag rather than recomputing on every read.
      by_active_window: number
    }
  }
  trip_participants: {
    key: string
    value: Row<'trip_participants'>
    indexes: {
      by_trip_id: string
      by_hunter_id: string
    }
  }
  profiles: {
    key: string
    value: Row<'profiles'>
  }
  wallet_items: {
    key: string
    value: Row<'wallet_items'>
    indexes: {
      by_user_id: string
      by_user_type: [string, string]
    }
  }
  trip_wallet_items: {
    key: string
    value: Row<'trip_wallet_items'>
    indexes: {
      by_trip_id: string
      by_hunter_type: [string, string]
    }
  }
  harvest_logs: {
    key: string
    value: Row<'harvest_logs'>
    indexes: {
      by_trip_id: string
    }
  }
  harvest_log_entries: {
    key: string
    value: Row<'harvest_log_entries'>
    indexes: {
      by_log_id: string
      by_hunter_id: string
    }
  }
  harvest_log_entry_species: {
    key: string
    value: Row<'harvest_log_entry_species'>
    indexes: {
      by_entry_id: string
    }
  }
  harvest_log_entry_user_inputs: {
    key: string
    value: Row<'harvest_log_entry_user_inputs'>
    indexes: {
      by_entry_id: string
    }
  }
  harvest_log_user_inputs: {
    key: string
    value: Row<'harvest_log_user_inputs'>
    indexes: {
      by_log_id: string
    }
  }
  trip_generated_logs: {
    key: string
    value: Row<'trip_generated_logs'>
    indexes: {
      by_trip_id: string
      by_log_id: string
    }
  }
  trip_docs: {
    key: string
    value: Row<'trip_docs'>
    indexes: {
      by_trip_id: string
      by_doc_id: string
    }
  }
  docs: {
    key: string
    value: Row<'docs'>
    indexes: {
      by_owner: string
      by_kind: string
    }
  }
  doc_field_mappings: {
    key: string
    value: Row<'doc_field_mappings'>
    indexes: {
      by_doc_id: string
    }
  }
  doc_signatures: {
    key: string
    value: Row<'doc_signatures'>
    indexes: {
      by_trip_doc_id: string
    }
  }
  pdf_templates: {
    key: string // doc_id
    value: CachedPdfTemplateMeta
  }
  outbox: {
    key: string
    value: OutboxEntry
    indexes: {
      by_status: string
      by_status_created_at: [string, string]
      by_entity: [string, string]
    }
  }
  signatures: {
    key: 'default'
    value: SignatureStoreRow
  }
}

export const DB_NAME = 'bitebook'
export const DB_VERSION = 1

// Internal cached promise so concurrent callers reuse one open connection.
let dbPromise: Promise<IDBPDatabase<BitebookDB>> | null = null

/**
 * Open the local IndexedDB. Returns null when called from a non-browser
 * context (SSR build, server actions) or when IDB is unavailable
 * (private mode in some browsers, sandboxed iframes). Callers MUST
 * null-check; never throw on missing DB.
 *
 * Schema is upgraded inside `openDB`'s `upgrade` callback. v1 is the
 * initial layout; later schema bumps add stores or indexes here.
 */
export function getDb(): Promise<IDBPDatabase<BitebookDB>> | null {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB<BitebookDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('trips')) {
          const trips = db.createObjectStore('trips', { keyPath: 'id' })
          trips.createIndex('by_status', 'status')
          trips.createIndex('by_starts_at', 'starts_at')
          // Set during precache; not a column on the server row, written
          // alongside the row via tx.put({...row, _activeWindow: 1}).
          // We don't include _activeWindow in the typed Row<'trips'> shape
          // because Database['public']['Tables']['trips']['Row'] doesn't
          // know about it. v27.7.0.1 will introduce a wrapper type that
          // adds local-only fields cleanly; for now the index is reserved.
          trips.createIndex('by_active_window', 'status')
        }
        if (!db.objectStoreNames.contains('trip_participants')) {
          const tp = db.createObjectStore('trip_participants', { keyPath: 'id' })
          tp.createIndex('by_trip_id', 'trip_id')
          tp.createIndex('by_hunter_id', 'hunter_id')
        }
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('wallet_items')) {
          const w = db.createObjectStore('wallet_items', { keyPath: 'id' })
          w.createIndex('by_user_id', 'user_id')
          w.createIndex('by_user_type', ['user_id', 'type'])
        }
        if (!db.objectStoreNames.contains('trip_wallet_items')) {
          const tw = db.createObjectStore('trip_wallet_items', { keyPath: 'id' })
          tw.createIndex('by_trip_id', 'trip_id')
          tw.createIndex('by_hunter_type', ['hunter_id', 'type'])
        }
        if (!db.objectStoreNames.contains('harvest_logs')) {
          const h = db.createObjectStore('harvest_logs', { keyPath: 'id' })
          h.createIndex('by_trip_id', 'trip_id')
        }
        if (!db.objectStoreNames.contains('harvest_log_entries')) {
          const e = db.createObjectStore('harvest_log_entries', { keyPath: 'id' })
          e.createIndex('by_log_id', 'log_id')
          e.createIndex('by_hunter_id', 'hunter_id')
        }
        if (!db.objectStoreNames.contains('harvest_log_entry_species')) {
          const s = db.createObjectStore('harvest_log_entry_species', { keyPath: 'id' })
          s.createIndex('by_entry_id', 'entry_id')
        }
        if (!db.objectStoreNames.contains('harvest_log_entry_user_inputs')) {
          const i = db.createObjectStore('harvest_log_entry_user_inputs', { keyPath: 'id' })
          i.createIndex('by_entry_id', 'entry_id')
        }
        if (!db.objectStoreNames.contains('harvest_log_user_inputs')) {
          const i = db.createObjectStore('harvest_log_user_inputs', { keyPath: 'id' })
          i.createIndex('by_log_id', 'log_id')
        }
        if (!db.objectStoreNames.contains('trip_generated_logs')) {
          const g = db.createObjectStore('trip_generated_logs', { keyPath: 'id' })
          g.createIndex('by_trip_id', 'trip_id')
          g.createIndex('by_log_id', 'log_id')
        }
        if (!db.objectStoreNames.contains('trip_docs')) {
          const td = db.createObjectStore('trip_docs', { keyPath: 'id' })
          td.createIndex('by_trip_id', 'trip_id')
          td.createIndex('by_doc_id', 'doc_id')
        }
        if (!db.objectStoreNames.contains('docs')) {
          const d = db.createObjectStore('docs', { keyPath: 'id' })
          d.createIndex('by_owner', 'owner_id')
          d.createIndex('by_kind', 'kind')
        }
        if (!db.objectStoreNames.contains('doc_field_mappings')) {
          const m = db.createObjectStore('doc_field_mappings', { keyPath: 'id' })
          m.createIndex('by_doc_id', 'doc_id')
        }
        if (!db.objectStoreNames.contains('doc_signatures')) {
          const s = db.createObjectStore('doc_signatures', { keyPath: 'id' })
          s.createIndex('by_trip_doc_id', 'trip_doc_id')
        }
        if (!db.objectStoreNames.contains('pdf_templates')) {
          db.createObjectStore('pdf_templates', { keyPath: 'doc_id' })
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const o = db.createObjectStore('outbox', { keyPath: 'id' })
          o.createIndex('by_status', 'status')
          o.createIndex('by_status_created_at', ['status', 'created_at'])
          o.createIndex('by_entity', ['entity_store', 'entity_id'])
        }
        if (!db.objectStoreNames.contains('signatures')) {
          db.createObjectStore('signatures', { keyPath: 'id' })
        }
      },
      blocked() {
        // Another tab is holding an older version. We don't auto-close
        // here; the user can close other tabs. Logged for diagnostics.
        try { console.warn('[bitebook idb] blocked — another tab on older schema') } catch {}
      },
      blocking() {
        // We're holding the older version while a new one wants to open.
        // Closing lets the upgrade proceed; consumers will reopen on next read.
        try { dbPromise = null } catch {}
      },
      terminated() {
        try { dbPromise = null } catch {}
      },
    })
  }
  return dbPromise
}

/** Convenience: read a single key from the meta store. */
export async function getMeta<T = unknown>(key: MetaKey): Promise<T | null> {
  const db = await getDb()
  if (!db) return null
  const row = await db.get('meta', key)
  return row ? (row.value as T) : null
}

/** Convenience: write a single key to the meta store. */
export async function setMeta<T = unknown>(key: MetaKey, value: T): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.put('meta', { key, value, updated_at: new Date().toISOString() })
}
