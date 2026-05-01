// v27.1.1.0 — Documents Module data-source catalog.
//
// The mapping wizard exposes these paths as a flat dropdown grouped by
// category. The auto-fill engine (v27.1.1.1) reads each saved mapping's
// `data_source_path` and resolves it against the trip + harvest + wallet
// + profile data fetched at fill time.
//
// Special sentinels:
//   STATIC_TEXT_PREFIX   → free-text override; the mapping row stores the
//                          literal string after the prefix in
//                          data_source_path (e.g. "static:Bigfork Outfitters").
//   SKIP_VALUE           → mapping exists but the field is intentionally
//                          left blank in the output. Distinct from "no
//                          mapping" so the guide can lock in the choice
//                          and the wizard renders a complete state.
//
// Naming convention: dotted paths matching the spec for forward-compat
// with the v27.1.1.1 fill engine. Paths under `harvest.*`, `hunter.*`,
// and `wallet_consumed.*` resolve PER ROW when the form has indexed
// fields (row1_*, row2_*) — engine handles the iteration.

export const STATIC_TEXT_PREFIX = 'static:'
export const SKIP_VALUE = 'skip'

export type DataSourceCategory =
  | 'trip'
  | 'guide'
  | 'guide_wallet'
  | 'hunter'
  | 'harvest'
  | 'wallet_consumed'
  | 'special'

export type DataSourceOption = {
  value: string                    // dotted path or sentinel
  label: string
  category: DataSourceCategory
  /** Per-row sources reference the harvest iteration. The fill engine
   *  treats them as templates the mapping-by-row resolver expands. */
  perRow?: boolean
  /** Type hint so the wizard can warn on obvious mismatches later (e.g.
   *  trying to map a date source to a checkbox field). v27.1.1.0 just
   *  records the hint; the engine in v27.1.1.1 will use it for coercion. */
  type?: 'text' | 'date' | 'boolean' | 'number'
}

export const DATA_SOURCES: DataSourceOption[] = [
  // Trip
  { value: 'trip.title',            label: 'Trip title',            category: 'trip', type: 'text' },
  { value: 'trip.location_city',    label: 'Trip city',             category: 'trip', type: 'text' },
  { value: 'trip.location_state',   label: 'Trip state',            category: 'trip', type: 'text' },
  { value: 'trip.location_zone',    label: 'Trip zone / unit',      category: 'trip', type: 'text' },
  { value: 'trip.location_county',  label: 'Trip county',           category: 'trip', type: 'text' },
  { value: 'trip.start_date',       label: 'Trip start date',       category: 'trip', type: 'date' },
  { value: 'trip.end_date',         label: 'Trip end date',         category: 'trip', type: 'date' },
  { value: 'trip.species_targeted', label: 'Trip target species',   category: 'trip', type: 'text' },
  { value: 'trip.method',           label: 'Trip method',           category: 'trip', type: 'text' },

  // Guide profile
  { value: 'guide.business_name',   label: 'Guide business name',   category: 'guide', type: 'text' },
  { value: 'guide.display_name',    label: 'Guide name',            category: 'guide', type: 'text' },

  // Guide wallet (guide_license)
  { value: 'guide_wallet.identifier',   label: 'Guide license number', category: 'guide_wallet', type: 'text' },
  { value: 'guide_wallet.state',        label: 'Guide license state',  category: 'guide_wallet', type: 'text' },
  { value: 'guide_wallet.holder_name',  label: 'Guide license holder', category: 'guide_wallet', type: 'text' },
  { value: 'guide_wallet.valid_to',     label: 'Guide license expires',category: 'guide_wallet', type: 'date' },

  // Hunter (per-row when form has indexed fields)
  { value: 'hunter.display_name', label: 'Hunter name',  category: 'hunter', type: 'text', perRow: true },
  { value: 'hunter.email',        label: 'Hunter email', category: 'hunter', type: 'text', perRow: true },

  // Harvest (per-row)
  { value: 'harvest.species_name',  label: 'Harvest species',     category: 'harvest', type: 'text', perRow: true },
  { value: 'harvest.tag_number',    label: 'Harvest tag number',  category: 'harvest', type: 'text', perRow: true },
  { value: 'harvest.method',        label: 'Harvest method',      category: 'harvest', type: 'text', perRow: true },
  { value: 'harvest.harvested_at',  label: 'Harvest date / time', category: 'harvest', type: 'date', perRow: true },
  { value: 'harvest.location_text', label: 'Harvest location',    category: 'harvest', type: 'text', perRow: true },
  { value: 'harvest.notes',         label: 'Harvest notes',       category: 'harvest', type: 'text', perRow: true },

  // Wallet item consumed by the harvest (the tag the harvest used)
  { value: 'wallet_consumed.identifier',         label: 'Tag identifier',         category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.species',            label: 'Tag species',            category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.state',              label: 'Tag state',              category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.zone',               label: 'Tag zone',               category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.season_year',        label: 'Tag season year',        category: 'wallet_consumed', type: 'number', perRow: true },
  { value: 'wallet_consumed.weapon_restriction', label: 'Tag weapon restriction', category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.tag_type',           label: 'Tag type',               category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.sex_restriction',    label: 'Tag sex restriction',    category: 'wallet_consumed', type: 'text', perRow: true },
  { value: 'wallet_consumed.valid_to',           label: 'Tag valid through',      category: 'wallet_consumed', type: 'date', perRow: true },

  // Special
  { value: STATIC_TEXT_PREFIX, label: 'Static text — type a value',   category: 'special' },
  { value: SKIP_VALUE,         label: 'Skip — leave field blank',     category: 'special' },
]

export const CATEGORY_ORDER: DataSourceCategory[] = [
  'trip', 'guide', 'guide_wallet', 'hunter', 'harvest', 'wallet_consumed', 'special',
]

export const CATEGORY_LABELS: Record<DataSourceCategory, string> = {
  trip:             'Trip',
  guide:            'Guide profile',
  guide_wallet:     'Guide license',
  hunter:           'Hunter',
  harvest:          'Harvest (per row)',
  wallet_consumed:  'Tag used (per row)',
  special:          'Special',
}

export function isStaticText(path: string): boolean {
  return path.startsWith(STATIC_TEXT_PREFIX) && path.length > STATIC_TEXT_PREFIX.length
}

export function staticTextValue(path: string): string {
  if (!path.startsWith(STATIC_TEXT_PREFIX)) return ''
  return path.slice(STATIC_TEXT_PREFIX.length)
}
