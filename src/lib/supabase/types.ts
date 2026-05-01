export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_accounts: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_accounts_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // v27.1.0 — Documents Module (hand-edited; auto-generation skipped per memory rule)
      doc_field_mappings: {
        Row: {
          bbox: Json | null
          created_at: string
          data_source_path: string | null
          doc_id: string
          field_name: string
          id: string
          mapping_kind: Database["public"]["Enums"]["doc_mapping_kind"]
          page_index: number | null
          signature_role: string | null
          updated_at: string
        }
        Insert: {
          bbox?: Json | null
          created_at?: string
          data_source_path?: string | null
          doc_id: string
          field_name: string
          id?: string
          mapping_kind: Database["public"]["Enums"]["doc_mapping_kind"]
          page_index?: number | null
          signature_role?: string | null
          updated_at?: string
        }
        Update: {
          bbox?: Json | null
          created_at?: string
          data_source_path?: string | null
          doc_id?: string
          field_name?: string
          id?: string
          mapping_kind?: Database["public"]["Enums"]["doc_mapping_kind"]
          page_index?: number | null
          signature_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_field_mappings_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      docs: {
        Row: {
          archived_at: string | null
          created_at: string
          file_mime: string
          file_path: string
          form_template_hash: string | null
          guide_id: string
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label: string
          mapping_status: string
          state: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          file_mime: string
          file_path: string
          form_template_hash?: string | null
          guide_id: string
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label: string
          mapping_status?: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          file_mime?: string
          file_path?: string
          form_template_hash?: string | null
          guide_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          label?: string
          mapping_status?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          id: string
          key: string
          rollout_pct: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          rollout_pct?: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          rollout_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      guide_profiles: {
        Row: {
          bio: string | null
          business_name: string | null
          created_at: string
          guide_license_expires_at: string | null
          id: string
          license_number: string | null
          max_party_size: number
          specialties: string[] | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          business_name?: string | null
          created_at?: string
          guide_license_expires_at?: string | null
          id?: string
          license_number?: string | null
          max_party_size?: number
          specialties?: string[] | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          business_name?: string | null
          created_at?: string
          guide_license_expires_at?: string | null
          id?: string
          license_number?: string | null
          max_party_size?: number
          specialties?: string[] | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvests: {
        Row: {
          consumed_wallet_item_id: string | null
          created_at: string
          harvested_at: string
          hunter_id: string | null
          id: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          length_in: number | null
          location_lat: number | null
          location_lng: number | null
          method: string | null
          notes: string | null
          ocr_confirmed: boolean
          ocr_raw: Json | null
          quantity: number
          species_id: string | null
          species_name: string | null
          tag_number: string | null
          trip_id: string
          updated_at: string
          weight_lbs: number | null
        }
        Insert: {
          consumed_wallet_item_id?: string | null
          created_at?: string
          harvested_at?: string
          hunter_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          length_in?: number | null
          location_lat?: number | null
          location_lng?: number | null
          method?: string | null
          notes?: string | null
          ocr_confirmed?: boolean
          ocr_raw?: Json | null
          quantity?: number
          species_id?: string | null
          species_name?: string | null
          tag_number?: string | null
          trip_id: string
          updated_at?: string
          weight_lbs?: number | null
        }
        Update: {
          consumed_wallet_item_id?: string | null
          created_at?: string
          harvested_at?: string
          hunter_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["harvest_kind"]
          length_in?: number | null
          location_lat?: number | null
          location_lng?: number | null
          method?: string | null
          notes?: string | null
          ocr_confirmed?: boolean
          ocr_raw?: Json | null
          quantity?: number
          species_id?: string | null
          species_name?: string | null
          tag_number?: string | null
          trip_id?: string
          updated_at?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "harvests_consumed_wallet_item_id_fkey"
            columns: ["consumed_wallet_item_id"]
            isOneToOne: false
            referencedRelation: "wallet_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvests_hunter_id_fkey"
            columns: ["hunter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvests_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvests_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          guide_id: string
          id: string
          last_sent_at: string
          status: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          guide_id: string
          id?: string
          last_sent_at?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          guide_id?: string
          id?: string
          last_sent_at?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string
          expires_at: string | null
          guide_id: string
          id: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          license_number: string
          state: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          guide_id: string
          id?: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          license_number: string
          state: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          guide_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["harvest_kind"]
          license_number?: string
          state?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          caption: string | null
          created_at: string
          harvest_id: string | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          size_bytes: number | null
          storage_path: string
          trip_id: string
          uploader_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          harvest_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          size_bytes?: number | null
          storage_path: string
          trip_id: string
          uploader_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          harvest_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          size_bytes?: number | null
          storage_path?: string
          trip_id?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_harvest_id_fkey"
            columns: ["harvest_id"]
            isOneToOne: false
            referencedRelation: "harvests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_outbox: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          operation: string
          payload: Json
          synced_at: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          operation: string
          payload: Json
          synced_at?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          operation?: string
          payload?: Json
          synced_at?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          steps_completed: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          steps_completed?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          steps_completed?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outfitter_subscriptions: {
        Row: {
          billing_interval:
            | Database["public"]["Enums"]["subscription_interval"]
            | null
          created_at: string
          current_period_end: string | null
          guide_id: string
          id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?:
            | Database["public"]["Enums"]["subscription_interval"]
            | null
          created_at?: string
          current_period_end?: string | null
          guide_id: string
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?:
            | Database["public"]["Enums"]["subscription_interval"]
            | null
          created_at?: string
          current_period_end?: string | null
          guide_id?: string
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outfitter_subscriptions_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_checklist_items: {
        Row: {
          category: string | null
          checked: boolean
          checklist_id: string
          id: string
          label: string
          quantity: number
          sort_order: number
        }
        Insert: {
          category?: string | null
          checked?: boolean
          checklist_id: string
          id?: string
          label: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          category?: string | null
          checked?: boolean
          checklist_id?: string
          id?: string
          label?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "packing_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_checklists: {
        Row: {
          created_at: string
          guide_id: string
          id: string
          is_template: boolean
          kind: Database["public"]["Enums"]["harvest_kind"] | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guide_id: string
          id?: string
          is_template?: boolean
          kind?: Database["public"]["Enums"]["harvest_kind"] | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guide_id?: string
          id?: string
          is_template?: boolean
          kind?: Database["public"]["Enums"]["harvest_kind"] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_checklists_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      private_feedback: {
        Row: {
          body: string
          context: Json | null
          created_at: string
          id: string
          reviewed: boolean
          sentiment: Database["public"]["Enums"]["feedback_sentiment"] | null
          user_id: string | null
        }
        Insert: {
          body: string
          context?: Json | null
          created_at?: string
          id?: string
          reviewed?: boolean
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
          user_id?: string | null
        }
        Update: {
          body?: string
          context?: Json | null
          created_at?: string
          id?: string
          reviewed?: boolean
          sentiment?: Database["public"]["Enums"]["feedback_sentiment"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "private_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_street2: string | null
          address_zip: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          first_name: string
          id: string
          last_name: string
          license_doc_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_street2?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          first_name?: string
          id: string
          last_name?: string
          license_doc_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_street2?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          first_name?: string
          id?: string
          last_name?: string
          license_doc_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_keys: {
        Row: {
          created_at: string
          id: string
          label: string
          public_key: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          public_key: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          public_key?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signing_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      species: {
        Row: {
          common_name: string | null
          id: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          name: string
          tags_required: boolean
        }
        Insert: {
          common_name?: string | null
          id?: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          name: string
          tags_required?: boolean
        }
        Update: {
          common_name?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["harvest_kind"]
          name?: string
          tags_required?: boolean
        }
        Relationships: []
      }
      tag_records: {
        Row: {
          confirmed: boolean
          confirmed_at: string | null
          created_at: string
          harvest_id: string
          id: string
          issued_to: string | null
          ocr_raw: Json | null
          species_name: string
          state: string
          tag_number: string
        }
        Insert: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          harvest_id: string
          id?: string
          issued_to?: string | null
          ocr_raw?: Json | null
          species_name: string
          state: string
          tag_number: string
        }
        Update: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          harvest_id?: string
          id?: string
          issued_to?: string | null
          ocr_raw?: Json | null
          species_name?: string
          state?: string
          tag_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_records_harvest_id_fkey"
            columns: ["harvest_id"]
            isOneToOne: false
            referencedRelation: "harvests"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participants: {
        Row: {
          added_at: string
          guest_name: string | null
          hunter_id: string | null
          id: string
          role: string
          trip_id: string
        }
        Insert: {
          added_at?: string
          guest_name?: string | null
          hunter_id?: string | null
          id?: string
          role?: string
          trip_id: string
        }
        Update: {
          added_at?: string
          guest_name?: string | null
          hunter_id?: string | null
          id?: string
          role?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_participants_hunter_id_fkey"
            columns: ["hunter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      // v27.1.0 — Documents Module (hand-edited)
      trip_doc_hunter_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["doc_action_type"]
          completed_at: string | null
          completed_data: Json | null
          created_at: string
          hunter_id: string
          id: string
          required: boolean
          trip_doc_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["doc_action_type"]
          completed_at?: string | null
          completed_data?: Json | null
          created_at?: string
          hunter_id: string
          id?: string
          required?: boolean
          trip_doc_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["doc_action_type"]
          completed_at?: string | null
          completed_data?: Json | null
          created_at?: string
          hunter_id?: string
          id?: string
          required?: boolean
          trip_doc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_doc_hunter_actions_hunter_id_fkey"
            columns: ["hunter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_doc_hunter_actions_trip_doc_id_fkey"
            columns: ["trip_doc_id"]
            isOneToOne: false
            referencedRelation: "trip_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_docs: {
        Row: {
          created_at: string
          created_by: string | null
          doc_id: string
          hunter_visible: boolean
          id: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_id: string
          hunter_visible?: boolean
          id?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_id?: string
          hunter_visible?: boolean
          id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_docs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_docs_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_docs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_reviews: {
        Row: {
          comment: string | null
          created_at: string
          guide_id: string
          hunter_id: string
          id: string
          rating: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          guide_id: string
          hunter_id: string
          id?: string
          rating: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          guide_id?: string
          hunter_id?: string
          id?: string
          rating?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_reviews_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_reviews_hunter_id_fkey"
            columns: ["hunter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_reviews_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_wallet_items: {
        Row: {
          action_status: Database["public"]["Enums"]["trip_wallet_action_status"]
          completed_at: string | null
          hunter_id: string
          id: string
          linked_at: string
          trip_id: string
          wallet_item_id: string
        }
        Insert: {
          action_status?: Database["public"]["Enums"]["trip_wallet_action_status"]
          completed_at?: string | null
          hunter_id: string
          id?: string
          linked_at?: string
          trip_id: string
          wallet_item_id: string
        }
        Update: {
          action_status?: Database["public"]["Enums"]["trip_wallet_action_status"]
          completed_at?: string | null
          hunter_id?: string
          id?: string
          linked_at?: string
          trip_id?: string
          wallet_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_wallet_items_hunter_id_fkey"
            columns: ["hunter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_wallet_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_wallet_items_wallet_item_id_fkey"
            columns: ["wallet_item_id"]
            isOneToOne: false
            referencedRelation: "wallet_items"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          city: string | null
          county: string | null
          created_at: string
          ends_at: string | null
          guide_id: string
          id: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          method: string | null
          notes: string | null
          signed_manifest: Json | null
          species_targeted: string | null
          starts_at: string
          state: string
          status: Database["public"]["Enums"]["trip_status"]
          title: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          city?: string | null
          county?: string | null
          created_at?: string
          ends_at?: string | null
          guide_id: string
          id?: string
          kind: Database["public"]["Enums"]["harvest_kind"]
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          method?: string | null
          notes?: string | null
          signed_manifest?: Json | null
          species_targeted?: string | null
          starts_at: string
          state?: string
          status?: Database["public"]["Enums"]["trip_status"]
          title: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          city?: string | null
          county?: string | null
          created_at?: string
          ends_at?: string | null
          guide_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["harvest_kind"]
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          method?: string | null
          notes?: string | null
          signed_manifest?: Json | null
          species_targeted?: string | null
          starts_at?: string
          state?: string
          status?: Database["public"]["Enums"]["trip_status"]
          title?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_items: {
        Row: {
          archived_at: string | null
          created_at: string
          document_mime: string | null
          document_url: string | null
          extras: Json | null
          id: string
          identifier: string
          issue_date: string | null
          jurisdiction: Database["public"]["Enums"]["wallet_jurisdiction"]
          notes: string | null
          season_year: number | null
          single_use: boolean
          species: string | null
          state: string | null
          tagged_out_at: string | null
          type: Database["public"]["Enums"]["wallet_item_type"]
          updated_at: string
          user_id: string
          valid_from: string
          valid_to: string
          zone: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          document_mime?: string | null
          document_url?: string | null
          extras?: Json | null
          id?: string
          identifier: string
          issue_date?: string | null
          jurisdiction: Database["public"]["Enums"]["wallet_jurisdiction"]
          notes?: string | null
          season_year?: number | null
          single_use?: boolean
          species?: string | null
          state?: string | null
          tagged_out_at?: string | null
          type: Database["public"]["Enums"]["wallet_item_type"]
          updated_at?: string
          user_id: string
          valid_from: string
          valid_to: string
          zone?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          document_mime?: string | null
          document_url?: string | null
          extras?: Json | null
          id?: string
          identifier?: string
          issue_date?: string | null
          jurisdiction?: Database["public"]["Enums"]["wallet_jurisdiction"]
          notes?: string | null
          season_year?: number | null
          single_use?: boolean
          species?: string | null
          state?: string | null
          tagged_out_at?: string | null
          type?: Database["public"]["Enums"]["wallet_item_type"]
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_to?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _is_trip_owner: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      _is_trip_participant: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      // v27.1.0 — Documents Module (hand-edited)
      doc_action_type: "sign" | "fill" | "view"
      doc_kind: "waiver" | "log" | "resource"
      doc_mapping_kind: "field" | "signature"
      feedback_sentiment: "positive" | "neutral" | "negative"
      harvest_kind: "hunting" | "fishing"
      invite_status:
        | "pending"
        | "accepted"
        | "expired"
        | "revoked"
        | "canceled"
        | "removed"
      media_kind: "photo" | "video"
      subscription_interval: "month" | "year"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      trip_status: "planned" | "active" | "completed" | "canceled"
      trip_wallet_action_status: "pending" | "completed"
      user_role: "guide" | "hunter" | "admin"
      wallet_item_type:
        | "license"
        | "tag"
        | "permit"
        | "stamp"
        | "harvest_report_card"
        | "guide_license"
        | "insurance"
        | "business_credential"
      wallet_jurisdiction: "federal" | "state"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      // v27.1.0 — Documents Module (hand-edited)
      doc_action_type: ["sign", "fill", "view"],
      doc_kind: ["waiver", "log", "resource"],
      doc_mapping_kind: ["field", "signature"],
      feedback_sentiment: ["positive", "neutral", "negative"],
      harvest_kind: ["hunting", "fishing"],
      invite_status: [
        "pending",
        "accepted",
        "expired",
        "revoked",
        "canceled",
        "removed",
      ],
      media_kind: ["photo", "video"],
      subscription_interval: ["month", "year"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      trip_status: ["planned", "active", "completed", "canceled"],
      trip_wallet_action_status: ["pending", "completed"],
      user_role: ["guide", "hunter", "admin"],
      wallet_item_type: [
        "license",
        "tag",
        "permit",
        "stamp",
        "harvest_report_card",
        "guide_license",
        "insurance",
        "business_credential",
      ],
      wallet_jurisdiction: ["federal", "state"],
    },
  },
} as const
