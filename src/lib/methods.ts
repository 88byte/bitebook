// v26.3: shared method options for trips and harvests. Used by NewTripForm,
// EditTripForm, and AddHarvestForm so the dropdown stays in sync everywhere.
//
// "N/A" is included for fishing trips where rod/reel doesn't fit any of the
// hunting categories. Stored as the literal string in trips.method /
// harvests.method (TEXT column, no enum so we can extend without a migration).
export const METHOD_OPTIONS = [
  'Rifle',
  'Shotgun',
  'Bow',
  'Muzzleloader',
  'Handgun',
  'Other',
  'N/A',
] as const

export type MethodOption = (typeof METHOD_OPTIONS)[number]

export function isValidMethod(value: string): value is MethodOption {
  return (METHOD_OPTIONS as readonly string[]).includes(value)
}
