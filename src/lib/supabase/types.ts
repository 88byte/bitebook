// Auto-generated types will live here after `supabase gen types typescript`.
// For now, a minimal stub so client/server compile.
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'guide' | 'hunter' | 'admin'
      subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
      trip_status: 'planned' | 'active' | 'completed' | 'canceled'
      harvest_kind: 'hunting' | 'fishing'
      invite_status: 'pending' | 'accepted' | 'expired' | 'revoked'
    }
  }
}
