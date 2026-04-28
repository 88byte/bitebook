// v25.9.1: shared US-state list. Both /app/settings (residential + outfitter
// state) and /app/trips/new (trip state) used to maintain their own inline
// copies; collapsing into one source of truth keeps additions consistent.
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
] as const

export type USState = typeof US_STATES[number]
