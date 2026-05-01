// v27.1.1.0   — Documents Module data-source catalog (initial).
// v27.1.1.0.1 — name granularity (full / first / last for guide + hunter),
//               valueType discriminator (string vs boolean) so the wizard
//               can filter sources by AcroForm field type, boolean sources
//               for checkbox fields, and two new sentinels for picked
//               dates and date ranges.
//
// The mapping wizard exposes these paths as a flat dropdown grouped by
// category. The auto-fill engine (v27.1.1.1) reads each saved mapping's
// `data_source_path` and resolves it against the trip + harvest + wallet
// + profile data fetched at fill time.
//
// Sentinels:
//   STATIC_TEXT_PREFIX        → free-text override; literal stored after the
//                               prefix, e.g. "static:Bigfork Outfitters".
//   STATIC_DATE_PREFIX        → guide picks one date; ISO stored as
//                               "static_date:2026-09-15". Engine formats per
//                               the receiving field's expected layout.
//   STATIC_DATE_RANGE_PREFIX  → guide picks two dates; stored as
//                               "static_date_range:2026-09-15..2026-09-20".
//   SKIP_VALUE                → explicit "leave blank" sentinel. NOTE: as of
//                               v27.1.1.0.1 unmapped fields are also treated
//                               as skip at fill time, so this sentinel is
//                               redundant in most cases. Kept for guides who
//                               want to lock in skip explicitly without
//                               leaving the field ambiguous.
//
// Name fields: state PDFs are inconsistent — some want a single "Name"
// field, others split into First / Last with a separate Middle. We expose
// full + first + last for both guide and hunter; the engine splits naively
// on whitespace at fill time. First chunk = first_name, everything after =
// last_name (so middle names ride with last). Single-name accounts (e.g.
// "Madonna") get full → first_name and empty last_name.
//
// Per-row sources (perRow=true) reference the harvest iteration. The fill
// engine in v27.1.1.1 expands them against indexed fields (row1_*, row2_*).

export const STATIC_TEXT_PREFIX = 'static:'
export const STATIC_DATE_PREFIX = 'static_date:'
export const STATIC_DATE_RANGE_PREFIX = 'static_date_range:'
export const SKIP_VALUE = 'skip'

// Sentinel "picker" values the wizard renders before the guide types a
// literal. They never get persisted; saveDocMappingsAction strips them.
export const PICKER_STATIC_TEXT = STATIC_TEXT_PREFIX
export const PICKER_STATIC_DATE = STATIC_DATE_PREFIX
export const PICKER_STATIC_DATE_RANGE = STATIC_DATE_RANGE_PREFIX

export type DataSourceCategory =
  | 'trip'
  | 'guide'
  | 'guide_wallet'
  | 'hunter'
  | 'hunter_license'
  | 'harvest'
  | 'wallet_consumed'
  | 'special'

/** valueType drives wizard filtering by AcroForm field type. checkbox PDF
 *  fields only see 'boolean' sources; text / radio / dropdown / optionList
 *  see 'string' sources. */
export type ValueType = 'string' | 'boolean'

export type DataSourceOption = {
  value: string
  label: string
  category: DataSourceCategory
  valueType: ValueType
  perRow?: boolean
  /** Type hint used by the engine for formatting (date sources resolve to
   *  the receiving field's expected layout). */
  type?: 'text' | 'date' | 'boolean' | 'number'
}

export const DATA_SOURCES: DataSourceOption[] = [
  // ── Trip ────────────────────────────────────────────────────────────
  { value: 'trip.title',                label: 'Trip title',                  category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_city',        label: 'Trip city',                   category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_state',       label: 'Trip state',                  category: 'trip', valueType: 'string', type: 'text' },
  // v27.1.1.0.2: pre-formatted "Redding, CA" for forms with a single
  // location field. Engine joins city + state with ", " and drops empty
  // segments cleanly.
  { value: 'trip.location_city_state',  label: 'Trip city, state (combined)', category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_zone',        label: 'Trip zone / unit',            category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_county',      label: 'Trip county',                 category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.start_date',           label: 'Trip start date',             category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.end_date',             label: 'Trip end date',               category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.species_targeted',     label: 'Trip target species',         category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.method',               label: 'Trip method',                 category: 'trip', valueType: 'string', type: 'text' },
  // boolean sibling of trip.* used by checkbox fields
  { value: 'trip.is_canceled',          label: 'Trip is canceled',            category: 'trip', valueType: 'boolean', type: 'boolean' },

  // ── Guide profile ───────────────────────────────────────────────────
  { value: 'guide.business_name', label: 'Guide business name', category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.full_name',     label: 'Guide full name',     category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.first_name',    label: 'Guide first name',    category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.last_name',     label: 'Guide last name',     category: 'guide', valueType: 'string', type: 'text' },
  // v27.1.1.0.2: guide address sources. Resolved against profiles.address_*
  // (single-line current + new street2). full_address concatenates with
  // ", " and skips empty segments. city_state mirrors trip.location_city_state.
  { value: 'guide.street1',       label: 'Guide street address',                    category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.street2',       label: 'Guide street address line 2',             category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city',          label: 'Guide city',                              category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.state',         label: 'Guide state',                             category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.postal_code',   label: 'Guide postal code',                       category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city_state',    label: 'Guide city, state (combined)',            category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.address_full',  label: 'Guide full address (single line)',        category: 'guide', valueType: 'string', type: 'text' },

  // ── Guide wallet (guide_license) ────────────────────────────────────
  { value: 'guide_wallet.identifier',  label: 'Guide license number',  category: 'guide_wallet', valueType: 'string', type: 'text' },
  { value: 'guide_wallet.state',       label: 'Guide license state',   category: 'guide_wallet', valueType: 'string', type: 'text' },
  { value: 'guide_wallet.holder_name', label: 'Guide license holder',  category: 'guide_wallet', valueType: 'string', type: 'text' },
  { value: 'guide_wallet.valid_to',    label: 'Guide license expires', category: 'guide_wallet', valueType: 'string', type: 'date' },

  // ── Hunter (per-row) ────────────────────────────────────────────────
  { value: 'hunter.full_name',  label: 'Hunter full name',  category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.first_name', label: 'Hunter first name', category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.last_name',  label: 'Hunter last name',  category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.email',      label: 'Hunter email',      category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  // v27.1.1.0.2: hunter address sources, mirrors guide. Resolved against
  // each harvest's hunter profile (per-row). Useful for forms with a
  // hunter address block per kill.
  { value: 'hunter.street1',      label: 'Hunter street address',                  category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.street2',      label: 'Hunter street address line 2',           category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city',         label: 'Hunter city',                            category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.state',        label: 'Hunter state',                           category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.postal_code',  label: 'Hunter postal code',                     category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city_state',   label: 'Hunter city, state (combined)',          category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.address_full', label: 'Hunter full address (single line)',      category: 'hunter', valueType: 'string', type: 'text', perRow: true },

  // ── Hunter license (per-row) ────────────────────────────────────────
  // v27.1.1.0.2: state forms typically need the hunter's hunting LICENSE
  // identifier next to each kill, separate from the consumed TAG (see
  // wallet_consumed.* below). Resolved per-harvest as: most recently
  // linked trip_wallet_items row where wallet_items.type='license' and
  // hunter_id matches; falls through to the hunter's primary active
  // license in their wallet if none linked.
  { value: 'hunter_license.identifier',  label: 'Hunter license number',           category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.state',       label: 'Hunter license state',            category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.valid_to',    label: 'Hunter license expires',          category: 'hunter_license', valueType: 'string', type: 'date', perRow: true },
  { value: 'hunter_license.holder_name', label: 'Hunter license holder',           category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },

  // ── Harvest (per-row) ───────────────────────────────────────────────
  { value: 'harvest.species_name',  label: 'Harvest species',     category: 'harvest', valueType: 'string', type: 'text', perRow: true },
  { value: 'harvest.tag_number',    label: 'Harvest tag number',  category: 'harvest', valueType: 'string', type: 'text', perRow: true },
  { value: 'harvest.method',        label: 'Harvest method',      category: 'harvest', valueType: 'string', type: 'text', perRow: true },
  { value: 'harvest.harvested_at',  label: 'Harvest date / time', category: 'harvest', valueType: 'string', type: 'date', perRow: true },
  { value: 'harvest.location_text', label: 'Harvest location',    category: 'harvest', valueType: 'string', type: 'text', perRow: true },
  { value: 'harvest.notes',         label: 'Harvest notes',       category: 'harvest', valueType: 'string', type: 'text', perRow: true },
  // boolean sibling
  { value: 'harvest.exists',        label: 'Trip has any harvest', category: 'harvest', valueType: 'boolean', type: 'boolean' },

  // ── Wallet item consumed by the harvest (the tag the harvest used) ──
  { value: 'wallet_consumed.identifier',         label: 'Tag identifier',         category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.species',            label: 'Tag species',            category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.state',              label: 'Tag state',              category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.zone',               label: 'Tag zone',               category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.season_year',        label: 'Tag season year',        category: 'wallet_consumed', valueType: 'string', type: 'number', perRow: true },
  { value: 'wallet_consumed.weapon_restriction', label: 'Tag weapon restriction', category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.tag_type',           label: 'Tag type',               category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.sex_restriction',    label: 'Tag sex restriction',    category: 'wallet_consumed', valueType: 'string', type: 'text', perRow: true },
  { value: 'wallet_consumed.valid_to',           label: 'Tag valid through',      category: 'wallet_consumed', valueType: 'string', type: 'date', perRow: true },
  // boolean siblings on the consumed tag — useful for state forms with
  // "Single-use only?" or "Federal stamp?" checkboxes
  { value: 'wallet_consumed.is_single_use', label: 'Tag is single-use', category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },
  { value: 'wallet_consumed.is_federal',    label: 'Tag is federal',    category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },

  // ── Special ─────────────────────────────────────────────────────────
  { value: STATIC_TEXT_PREFIX,        label: 'Type your own value',                 category: 'special', valueType: 'string' },
  { value: STATIC_DATE_PREFIX,        label: 'Pick a date',                         category: 'special', valueType: 'string', type: 'date' },
  { value: STATIC_DATE_RANGE_PREFIX,  label: 'Pick a date range',                   category: 'special', valueType: 'string', type: 'date' },
  { value: SKIP_VALUE,                label: 'Skip — leave field blank',            category: 'special', valueType: 'string' },

  // Boolean special — applied to checkbox fields. "Static text" doesn't make
  // sense for booleans so we skip it; STATIC_DATE_* are string-valued.
  { value: 'static:checked',   label: 'Always checked',         category: 'special', valueType: 'boolean' },
  { value: 'static:unchecked', label: 'Always unchecked',       category: 'special', valueType: 'boolean' },
  { value: SKIP_VALUE,         label: 'Skip — leave unchecked', category: 'special', valueType: 'boolean' },
]

export const CATEGORY_ORDER: DataSourceCategory[] = [
  'trip', 'guide', 'guide_wallet', 'hunter', 'hunter_license', 'harvest', 'wallet_consumed', 'special',
]

export const CATEGORY_LABELS: Record<DataSourceCategory, string> = {
  trip:             'Trip',
  guide:            'Guide profile',
  guide_wallet:     'Guide license',
  hunter:           'Hunter',
  hunter_license:   'Hunter license (per row)',
  harvest:          'Harvest (per row)',
  wallet_consumed:  'Tag used (per row)',
  special:          'Special',
}

// ── Sentinels & helpers ────────────────────────────────────────────────

export function isStaticText(path: string): boolean {
  return path.startsWith(STATIC_TEXT_PREFIX) && path.length > STATIC_TEXT_PREFIX.length
    && !path.startsWith(STATIC_DATE_PREFIX) && !path.startsWith(STATIC_DATE_RANGE_PREFIX)
    && path !== 'static:checked' && path !== 'static:unchecked'
}

export function staticTextValue(path: string): string {
  if (!isStaticText(path)) return ''
  return path.slice(STATIC_TEXT_PREFIX.length)
}

export function isStaticDate(path: string): boolean {
  return path.startsWith(STATIC_DATE_PREFIX) && path.length > STATIC_DATE_PREFIX.length
    && !path.startsWith(STATIC_DATE_RANGE_PREFIX)
}
export function staticDateValue(path: string): string {
  if (!isStaticDate(path)) return ''
  return path.slice(STATIC_DATE_PREFIX.length)
}

export function isStaticDateRange(path: string): boolean {
  return path.startsWith(STATIC_DATE_RANGE_PREFIX) && path.length > STATIC_DATE_RANGE_PREFIX.length
}
export function staticDateRangeValue(path: string): { start: string; end: string } {
  if (!isStaticDateRange(path)) return { start: '', end: '' }
  const raw = path.slice(STATIC_DATE_RANGE_PREFIX.length)
  const [start, end] = raw.split('..')
  return { start: start ?? '', end: end ?? '' }
}

/** Filter the catalog by AcroForm field type. PDF checkbox fields receive
 *  only boolean sources; everything else receives string sources. */
export function valueTypeForFieldType(
  fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown'
): ValueType {
  return fieldType === 'checkbox' ? 'boolean' : 'string'
}

export function sourcesForFieldType(
  fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown'
): DataSourceOption[] {
  const want = valueTypeForFieldType(fieldType)
  return DATA_SOURCES.filter((s) => s.valueType === want)
}
