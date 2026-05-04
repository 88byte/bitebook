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
// v27.1.1.0.3c.3 — plain-English label rewrite. Storage paths unchanged;
//                  only the human-facing label strings (and CATEGORY_LABELS)
//                  shift to the kind of phrasing a non-technical guide
//                  would actually pick from a list. Internal rule: prefer
//                  conversational fragments ("Trip name", "This hunter's
//                  hours") over schema-y prefixes ("Trip title", "Total
//                  hours (this hunter)").
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
  | 'hunter_harvest_report_card'
  | 'hunter_stamp'
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
  { value: 'trip.title',                label: 'Trip name',                            category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_city',        label: 'Trip city',                            category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_state',       label: 'Trip state',                           category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_city_state',  label: 'Trip city + state',                    category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_zone',        label: 'Trip zone or unit',                    category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.location_county',      label: 'Trip county',                          category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.start_date',           label: 'Trip start date',                      category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.end_date',             label: 'Trip end date',                        category: 'trip', valueType: 'string', type: 'date' },
  { value: 'trip.species_targeted',     label: 'Species you were after',               category: 'trip', valueType: 'string', type: 'text' },
  { value: 'trip.method',               label: 'How you hunted (gun, bow, etc.)',      category: 'trip', valueType: 'string', type: 'text' },
  // Trip-level derived from harvest_log
  { value: 'harvest_log.log_date',          label: 'Hunt date',                              category: 'trip', valueType: 'string', type: 'date' },
  { value: 'harvest_log.total_hours_sum',   label: 'Total hours across all hunters',         category: 'trip', valueType: 'string', type: 'number' },
  // Boolean sibling for trip-level checkbox fields.
  { value: 'trip.is_canceled',              label: 'Trip was canceled',                            category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_hunting',     label: 'Trip is hunting (checks if hunting)',        category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_big_game',    label: 'Trip is big game (checks if big game)',     category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_fishing',     label: 'Trip is fishing (checks if fishing)',        category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_fly_fishing', label: 'Trip is fly fishing (checks if fly fishing)', category: 'trip', valueType: 'boolean', type: 'boolean' },
  { value: 'harvest_log.purpose.has_other',       label: 'Trip is other (checks if "other")',          category: 'trip', valueType: 'boolean', type: 'boolean' },
  // v27.1.1.0.3c.1: string variants for PDFs whose trip-purpose field is a
  // text input rather than a checkbox. summary joins all checked purposes
  // ("Hunting, Fly fishing"); first returns the first checked label.
  { value: 'harvest_log.purpose.summary',         label: 'Trip purpose (joined, e.g. "Hunting, Fishing")', category: 'trip', valueType: 'string', type: 'text' },
  { value: 'harvest_log.purpose.first',           label: 'Trip purpose (first one picked)',                category: 'trip', valueType: 'string', type: 'text' },

  // ── Guide profile ──────────────────────────────────────────────────
  { value: 'guide.business_name',  label: 'Guide business name',                category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.full_name',      label: "Guide's full name",                  category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.first_name',     label: "Guide's first name",                 category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.last_name',      label: "Guide's last name",                  category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.street1',        label: "Guide's street address",             category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.street2',        label: "Guide's street address line 2",      category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city',           label: "Guide's city",                       category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.state',          label: "Guide's state",                      category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.postal_code',    label: "Guide's ZIP code",                   category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.city_state',     label: "Guide's city + state",               category: 'guide', valueType: 'string', type: 'text' },
  { value: 'guide.address_full',   label: "Guide's full address (one line)",    category: 'guide', valueType: 'string', type: 'text' },

  // ── Guide license (renamed from guide_wallet) ─────────────────────
  { value: 'guide_license.identifier',   label: "Guide's license number",      category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.state',        label: "Guide's license state",       category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.holder_name',  label: 'Name on guide license',       category: 'guide_license', valueType: 'string', type: 'text' },
  { value: 'guide_license.valid_to',     label: "Guide's license expires",     category: 'guide_license', valueType: 'string', type: 'date' },

  // ── Per-hunter slot: hunter ─────────────────────────────────────────
  { value: 'hunter.full_name',     label: "Hunter's full name",                 category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.first_name',    label: "Hunter's first name",                category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.last_name',     label: "Hunter's last name",                 category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.phone',         label: "Hunter's phone",                     category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.street1',       label: "Hunter's street address",            category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.street2',       label: "Hunter's street address line 2",     category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city',          label: "Hunter's city",                      category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.state',         label: "Hunter's state",                     category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.postal_code',   label: "Hunter's ZIP code",                  category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.city_state',    label: "Hunter's city + state",              category: 'hunter', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter.address_full',  label: "Hunter's full address (one line)",   category: 'hunter', valueType: 'string', type: 'text', perRow: true },

  // ── Per-hunter slot: hunter license ─────────────────────────────────
  { value: 'hunter_license.identifier',  label: 'License number',          category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.state',       label: 'License state',           category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },
  { value: 'hunter_license.valid_to',    label: 'License expires',         category: 'hunter_license', valueType: 'string', type: 'date', perRow: true },
  { value: 'hunter_license.holder_name', label: 'Name on license',         category: 'hunter_license', valueType: 'string', type: 'text', perRow: true },

  // ── Per-hunter slot: harvest report card ────────────────────────────
  // v27.1.1.0.3d.2.7: state forms with separate "Tag Report Card" boxes
  // for each hunter's paper report card (e.g. CDFW Bear Tag Report). Was
  // previously absent so AI mismapped to license sources.
  { value: 'hunter_harvest_report_card.identifier', label: 'Harvest report card number',     category: 'hunter_harvest_report_card', valueType: 'string', type: 'text',   perRow: true },
  { value: 'hunter_harvest_report_card.state',      label: 'Harvest report card state',      category: 'hunter_harvest_report_card', valueType: 'string', type: 'text',   perRow: true },
  { value: 'hunter_harvest_report_card.year',       label: 'Harvest report card year',       category: 'hunter_harvest_report_card', valueType: 'string', type: 'number', perRow: true },
  { value: 'hunter_harvest_report_card.valid_to',   label: 'Harvest report card valid through', category: 'hunter_harvest_report_card', valueType: 'string', type: 'date',   perRow: true },

  // ── Per-hunter slot: stamp ──────────────────────────────────────────
  // v27.1.1.0.3d.2.7: federal duck stamp / state stamp / migratory bird
  // validation. Per-hunter; AI no longer needs to fall back to "Skip"
  // or hallucinate into a license source for these fields.
  { value: 'hunter_stamp.identifier',   label: 'Stamp number',                    category: 'hunter_stamp', valueType: 'string', type: 'text',   perRow: true },
  { value: 'hunter_stamp.jurisdiction', label: 'Stamp jurisdiction (Federal / State)', category: 'hunter_stamp', valueType: 'string', type: 'text',   perRow: true },
  { value: 'hunter_stamp.state',        label: 'Stamp state',                     category: 'hunter_stamp', valueType: 'string', type: 'text',   perRow: true },
  { value: 'hunter_stamp.year',         label: 'Stamp year',                      category: 'hunter_stamp', valueType: 'string', type: 'number', perRow: true },
  { value: 'hunter_stamp.valid_to',     label: 'Stamp valid through',             category: 'hunter_stamp', valueType: 'string', type: 'date',   perRow: true },

  // ── Per-hunter slot: harvest entry + species rows ───────────────────
  // Entry-level scalars (one per slot).
  { value: 'harvest_log_entry.total_hours', label: "This hunter's hours",         category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry.notes',       label: "This hunter's notes",         category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  // Species rows 1..3 (1-indexed). State forms typically have 1-3 species
  // columns per hunter row; engine reads species_rows[N-1] for each path.
  { value: 'harvest_log_entry_species[1].species',                 label: 'First species this hunter took',           category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[1].qty_harvested',           label: 'How many of the first species harvested',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[1].qty_released',            label: 'How many of the first species released',   category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  // v27.3.7.2 / v27.3.7.3: per-species tag # / report card #. 1st
  // species auto-fills from the entry-linked wallet items. 2nd+
  // species use a mandatory mode dropdown (same|manual) on the
  // harvest log row that drives this resolver value.
  { value: 'harvest_log_entry_species[1].tag_identifier',          label: 'Tag # for the first species',              category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[1].report_card_identifier',  label: 'Report card # for the first species',      category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[2].species',                 label: 'Second species this hunter took',          category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[2].qty_harvested',           label: 'How many of the second species harvested', category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[2].qty_released',            label: 'How many of the second species released',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[2].tag_identifier',          label: 'Tag # for the second species',             category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[2].report_card_identifier',  label: 'Report card # for the second species',     category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[3].species',                 label: 'Third species this hunter took',           category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[3].qty_harvested',           label: 'How many of the third species harvested',  category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[3].qty_released',            label: 'How many of the third species released',   category: 'harvest', valueType: 'string', type: 'number', perRow: true },
  { value: 'harvest_log_entry_species[3].tag_identifier',          label: 'Tag # for the third species',              category: 'harvest', valueType: 'string', type: 'text',   perRow: true },
  { value: 'harvest_log_entry_species[3].report_card_identifier',  label: 'Report card # for the third species',      category: 'harvest', valueType: 'string', type: 'text',   perRow: true },

  // ── Per-hunter slot: tag the entry consumed ─────────────────────────
  { value: 'wallet_consumed.identifier',         label: 'Tag number',                              category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.species',            label: 'Species on the tag',                      category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.state',              label: 'State the tag is for',                    category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.zone',               label: 'Zone or unit on the tag',                 category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.season_year',        label: 'Tag season year',                         category: 'wallet_consumed', valueType: 'string', type: 'number', perRow: true },
  { value: 'wallet_consumed.weapon_restriction', label: 'Weapon allowed by the tag',               category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.tag_type',           label: 'Tag type',                                category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.sex_restriction',    label: 'Sex limit on the tag',                    category: 'wallet_consumed', valueType: 'string', type: 'text',   perRow: true },
  { value: 'wallet_consumed.valid_to',           label: 'Tag good through (date)',                 category: 'wallet_consumed', valueType: 'string', type: 'date',   perRow: true },
  { value: 'wallet_consumed.is_single_use',      label: 'Tag is single-use (checks if true)',      category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },
  { value: 'wallet_consumed.is_federal',         label: 'Tag is federal (checks if true)',         category: 'wallet_consumed', valueType: 'boolean', type: 'boolean', perRow: true },

  // ── Special ─────────────────────────────────────────────────────────
  { value: STATIC_TEXT_PREFIX,        label: 'Type your own value',                 category: 'special', valueType: 'string' },
  { value: STATIC_DATE_PREFIX,        label: 'Pick a date',                         category: 'special', valueType: 'string', type: 'date' },
  { value: STATIC_DATE_RANGE_PREFIX,  label: 'Pick a date range',                   category: 'special', valueType: 'string', type: 'date' },
  // v27.1.5.4.1: signature_date.now sentinel. The fill engine resolves
  // this to NULL at PDF generation (leaves the field blank); the e-
  // signature engine fills it with the actual signing timestamp at the
  // moment the document is signed. Use for any "Date Signed", "Date of
  // Signature", or "Signature Date" field — NEVER map those to
  // harvest_log.log_date (hunt date) or wallet.valid_to.
  { value: 'signature_date.now',      label: 'Date when document is signed (fills at signing)', category: 'special', valueType: 'string', type: 'date' },
  // v27.2.0.3: e-signature image sentinels — one per signer role. The
  // fill engine resolves both to NULL (same pattern as signature_date.
  // now); the signing engine reads doc_field_mappings rows mapped to
  // these paths, looks up the AcroForm widget's rect via pdf-lib, and
  // embeds the signer's signature image there. Pick e_signature.hunter
  // for hunter-signed waiver fields, e_signature.guide for guide-signed
  // ones. Field-name heuristics ("Hunter Signature" → hunter,
  // "Guide Signature" → guide) drive AI auto-mapping.
  { value: 'e_signature.hunter',      label: 'Hunter signature (fills at signing)',             category: 'special', valueType: 'string' },
  { value: 'e_signature.guide',       label: 'Guide signature (fills at signing)',              category: 'special', valueType: 'string' },
  { value: SKIP_VALUE,                label: 'Skip — leave blank',                  category: 'special', valueType: 'string' },
  { value: 'static:checked',          label: 'Always checked',                      category: 'special', valueType: 'boolean' },
  { value: 'static:unchecked',        label: 'Always unchecked',                    category: 'special', valueType: 'boolean' },
  { value: SKIP_VALUE,                label: 'Skip — leave unchecked',              category: 'special', valueType: 'boolean' },
]

export const CATEGORY_ORDER: DataSourceCategory[] = [
  'trip',
  'guide',
  'guide_license',
  'hunter',
  'hunter_license',
  'hunter_harvest_report_card',
  'hunter_stamp',
  'harvest',
  'wallet_consumed',
  'special',
]

export const CATEGORY_LABELS: Record<DataSourceCategory, string> = {
  trip:                       'About this trip',
  guide:                      'About the guide',
  guide_license:              "Guide's license",
  hunter:                     'About this hunter',
  hunter_license:             "Hunter's license",
  hunter_harvest_report_card: "Hunter's harvest report card",
  hunter_stamp:               "Hunter's stamp",
  harvest:                    'What this hunter took',
  wallet_consumed:            'Tag this hunter used',
  special:                    'Other options',
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
