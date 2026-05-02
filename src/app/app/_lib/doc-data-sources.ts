// v27.1.1.0   — Documents Module data-source catalog (initial).
// v27.1.1.0.1 — name granularity, valueType discriminator, boolean sources,
//               date sentinels.
// v27.1.1.0.2 — combined city,state, hunter license, address fields, plain
//               English copy.
// v27.1.1.0.3c — full alignment with the harvest_log architecture.
//                Removes stale `harvest.*` paths (replaced by
//                `harvest_log_entry.*` and `harvest_log_entry_species[N].*`).
//                Renames `guide_wallet.*` → `guide_license.*` for clarity.
//                Adds `hunter.phone`. Drops `hunter.email` (not in spec).
//                Moves trip-level harvest_log derived sources (log_date,
//                total_hours_sum, purpose.has_*) into the trip category
//                where they semantically belong. Adds three explicit
//                species rows per slot — `harvest_log_entry_species[1..3]`.
//
// The mapping wizard's source filtering (sourcesForFieldOnSlot) hides
// per-slot sources on trip-level fields and trip/guide sources on
// per-slot fields, so the dropdown stays focused per-context.

export const STATIC_TEXT_PREFIX = 'static:'
export const STATIC_DATE_PREFIX = 'static_date:'
export const STATIC_DATE_RANGE_PREFIX = 'static_date_range:'
export const SKIP_VALUE = 'skip'

export const PICKER_STATIC_TEXT = STATIC_TEXT_PREFIX
export const PICKER_STATIC_DATE = STATIC_DATE_PREFIX
export const PICKER_STATIC_DATE_RANGE = STATIC_DATE_RANGE_PREFIX

export type DataSourceCategory =
  | 'trip'
  | 'guide'
  | 'guide_license'
  | 'hunter'
  | 'hunter_license'
  | 'harvest'
  | 'wallet_consumed'
  | 'special'

export type ValueType = 'string' | 'boolean'

export type DataSourceOption = {
  value: string
  label: string
  category: DataSourceCategory
  valueType: ValueType
  perRow?: boolean
  type?: 'text' | 'date' | 'boolean' | 'number'
}

export const DATA_SOURCES: DataSourceOption[] = [
  // ── Trip + harvest log (trip-level) ─────────────────────────────────
  { value: 'trip.title',                label: 'Trip title',                  category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_city',        label: 'Trip city',                   category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_state',       label: 'Trip state',                  category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_city_state',  label: 'Trip city, state (combined)', category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_zone',        label: 'Trip zone / unit',            category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_county',      label: 'Trip county',                 category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.start_date',           label: 'Trip start date',             category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.end_date',             label: 'Trip end date',               category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.species_targeted',     label: 'Trip target species',         category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.method',               label: 'Trip method',                 category: 'trip', valueType: 'string', type: 'text' },
  // Trip-level derived from harvest_log
  { value: 'harvest_log.log_date',          label: 'Hunt date',                          category: 'trip', valueType: 'string', type: 'date' },
  { value: 'harvest_log.total_hours_sum',   label: 'Total hours (sum across hunters)',   category: 'trip', valueType: 'string', type: 'number' },
  // Boolean sibling for trip-level checkbox fields.
  { value: 'trip.is_canceled',              label: 'Trip is canceled',                   category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_hunting',     label: 'Trip purpose: hunting',         category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_big_game',    label: 'Trip purpose: big game',        category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_fishing',     label: 'Trip purpose: fishing',         category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_fly_fishing', label: 'Trip purpose: fly fishing',     category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_other',       label: 'Trip purpose: other',           category: 'trip', valueType: 'boolean', type: 'boolean' },

  // ── Guide profile ──────────────────────────────────────────────────
  { value: 'guide.business_name',  label: 'Guide business name',                   category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.full_name',      label: 'Guide full name',                       category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.first_name',     label: 'Guide first name',                      category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.last_name',      label: 'Guide last name',                       category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.street1',        label: 'Guide street address',                  category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.street2',        label: 'Guide street address line 2',           category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city',           label: 'Guide city',                            category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.state',          label: 'Guide state',                           category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.postal_code',    label: 'Guide postal code',                     category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city_state',     label: 'Guide city, state (combined)',          category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.address_full',   label: 'Guide full address (single line)',      category: 'guide', valueType: 'string', type: 'text' },

  // ── Guide license (renamed from guide_wallet) ─────────────────────
  { value: 'guide_license.identifier',   label: 'Guide license number',  category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.state',        label: 'Guide license state',   category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.holder_name',  label: 'Guide license holder',  category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.valid_to',     label: 'Guide license expires', category: 'guide_license', valueType: 'string', type: 'date' },

  // ── Per-hunter slot: hunter ─────────────────────────────────────────
  { value: 'hunter.full_name',     label: 'Hunter full name',                       category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.first_name',    label: 'Hunter first name',                      category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.last_name',     label: 'Hunter last name',                       category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.phone',         label: 'Hunter phone',                           category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.street1',       label: 'Hunter street address',                  category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.street2',       label: 'Hunter street address line 2',           category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city',          label: 'Hunter city',                            category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.state',         label: 'Hunter state',                           category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.postal_code',   label: 'Hunter postal code',                     category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city_state',    label: 'Hunter city, state (combined)',          category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.address_full',  label: 'Hunter full address (single line)',      category: 'hunter', valueType: 'string', type: 'text', perRow: true },

  // ── Per-hunter slot: hunter license ─────────────────────────────────
  { value: 'hunter_license.identifier',  label: 'Hunter license number',           category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.state',       label: 'Hunter license state',            category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.valid_to',    label: 'Hunter license expires',          category: 'hunter_license', valueType: 'string', type: 'date', perRow: true },
  { value: 'hunter_license.holder_name', label: 'Hunter license holder',           category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },

  // ── Per-hunter slot: harvest entry + species rows ───────────────────
  // Entry-level scalars (one per slot).
  { value: 'harvest_log_entry.total_hours', label: 'Total hours (this hunter)', category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry.notes',       label: 'Hunter entry notes',         category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  // Species rows 1..3 (1-indexed). State forms typically have 1-3 species
  // columns per hunter row; engine reads species_rows[N-1] for each path.
  { value: 'harvest_log_entry_species[1].species',       label: 'Species 1',          category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[1].qty_harvested', label: 'Species 1 qty harvested', category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[1].qty_released',  label: 'Species 1 qty released',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[2].species',       label: 'Species 2',          category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[2].qty_harvested', label: 'Species 2 qty harvested', category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[2].qty_released',  label: 'Species 2 qty released',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[3].species',       label: 'Species 3',          category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[3].qty_harvested', label: 'Species 3 qty harvested', category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[3].qty_released',  label: 'Species 3 qty released',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },

  // ── Per-hunter slot: tag the entry consumed ─────────────────────────
  { value: 'wallet_consumed.identifier',         label: 'Tag identifier',          category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.species',            label: 'Tag species',             category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.state',              label: 'Tag state',               category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.zone',               label: 'Tag zone',                category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.season_year',        label: 'Tag season year',         category: 'wallet_consumed', valueType: 'string', type: 'number', perRow: true },
  { value: 'wallet_consumed.weapon_restriction', label: 'Tag weapon restriction',  category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.tag_type',           label: 'Tag type',                category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.sex_restriction',    label: 'Tag sex restriction',     category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.valid_to',           label: 'Tag valid through',       category: 'wallet_consumed', valueType: 'string', type: 'date',   perRow: true },
  { value: 'wallet_consumed.is_single_use',      label: 'Tag is single-use',       category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },
  { value: 'wallet_consumed.is_federal',         label: 'Tag is federal',          category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },

  // ── Special ─────────────────────────────────────────────────────────
  { value: STATIC_TEXT_PREFIX,        label: 'Type your own value',                 category: 'special', valueType: 'string' },
  { value: STATIC_DATE_PREFIX,        label: 'Pick a date',                         category: 'special', valueType: 'string', type: 'date' },
  { value: STATIC_DATE_RANGE_PREFIX,  label: 'Pick a date range',                   category: 'special', valueType: 'string', type: 'date' },
  { value: SKIP_VALUE,                label: 'Skip — leave field blank',            category: 'special', valueType: 'string' },
  { value: 'static:checked',          label: 'Always checked',                      category: 'special', valueType: 'boolean' },
  { value: 'static:unchecked',        label: 'Always unchecked',                    category: 'special', valueType: 'boolean' },
  { value: SKIP_VALUE,                label: 'Skip — leave unchecked',              category: 'special', valueType: 'boolean' },
]

export const CATEGORY_ORDER: DataSourceCategory[] = [
  'trip', 'guide', 'guide_license', 'hunter', 'hunter_license', 'harvest', 'wallet_consumed', 'special',
]

export const CATEGORY_LABELS: Record<DataSourceCategory, string> = {
  trip:             'Trip',
  guide:            'Guide profile',
  guide_license:    'Guide license',
  hunter:           'Hunter (per slot)',
  hunter_license:   'Hunter license (per slot)',
  harvest:          'Harvest entry (per slot)',
  wallet_consumed:  'Tag used (per slot)',
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

export function valueTypeForFieldType(
  fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown'
): ValueType {
  return fieldType === 'checkbox' ? 'boolean' : 'string'
}

// v27.1.1.0.3c: filter sources by both AcroForm field type AND the
// detected slot. Slot >= 1 (per-hunter field) → only perRow sources +
// special. Slot === 0 (trip-level field) → only NON-perRow sources +
// special. Wizard scopes the dropdown so the user doesn't drag a
// per-hunter source onto a trip-level field.
export function sourcesForFieldOnSlot(
  fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown',
  slot: number
): DataSourceOption[] {
  const want = valueTypeForFieldType(fieldType)
  return DATA_SOURCES.filter((s) => {
    if (s.valueType !== want) return false
    if (s.category === 'special') return true
    if (slot >= 1) return s.perRow === true
    return s.perRow !== true
  })
}

// Legacy (v27.1.1.0.1) filter without slot awareness. Kept so the
// existing wizard call site doesn't hard-fail before being switched
// over to sourcesForFieldOnSlot.
export function sourcesForFieldType(
  fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown'
): DataSourceOption[] {
  const want = valueTypeForFieldType(fieldType)
  return DATA_SOURCES.filter((s) => s.valueType === want)
}
