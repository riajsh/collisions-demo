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
      activities: {
        Row: {
          activity_date: string
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at: string
          created_by: string | null
          fts: unknown
          id: string
          introduced_by: string | null
          introduction_outcome:
            | Database["public"]["Enums"]["introduction_outcome"]
            | null
          metadata: Json
          org_id: string
          profile_id: string
          source: Database["public"]["Enums"]["activity_source"]
          source_ref: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_date: string
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          created_by?: string | null
          fts?: unknown
          id?: string
          introduced_by?: string | null
          introduction_outcome?:
            | Database["public"]["Enums"]["introduction_outcome"]
            | null
          metadata?: Json
          org_id: string
          profile_id: string
          source: Database["public"]["Enums"]["activity_source"]
          source_ref?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          created_by?: string | null
          fts?: unknown
          id?: string
          introduced_by?: string | null
          introduction_outcome?:
            | Database["public"]["Enums"]["introduction_outcome"]
            | null
          metadata?: Json
          org_id?: string
          profile_id?: string
          source?: Database["public"]["Enums"]["activity_source"]
          source_ref?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_introduced_by_fkey"
            columns: ["introduced_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          last_sync_at: string | null
          metadata: Json
          org_id: string
          refresh_token: string
          sync_cursor: string | null
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          org_id: string
          refresh_token: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          org_id?: string
          refresh_token?: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          calendar_account_id: string
          created_at: string
          description: string | null
          end_at: string | null
          google_event_id: string
          ical_uid: string | null
          id: string
          is_deleted: boolean
          org_id: string
          participants: Json
          source_calendar_id: string | null
          start_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          calendar_account_id: string
          created_at?: string
          description?: string | null
          end_at?: string | null
          google_event_id: string
          ical_uid?: string | null
          id?: string
          is_deleted?: boolean
          org_id: string
          participants?: Json
          source_calendar_id?: string | null
          start_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          calendar_account_id?: string
          created_at?: string
          description?: string | null
          end_at?: string | null
          google_event_id?: string
          ical_uid?: string | null
          id?: string
          is_deleted?: boolean
          org_id?: string
          participants?: Json
          source_calendar_id?: string | null
          start_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_participant_reviews: {
        Row: {
          calendar_event_id: string
          created_at: string
          display_name: string | null
          email: string
          id: string
          org_id: string
          profile_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["participant_review_status"]
          updated_at: string
        }
        Insert: {
          calendar_event_id: string
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          org_id: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          org_id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_participant_reviews_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_participant_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_participant_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_participant_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          connection_type: Database["public"]["Enums"]["connection_type"]
          created_at: string
          id: string
          introduced_by: string | null
          notes: string | null
          org_id: string
          profile_a_id: string
          profile_b_id: string
          source: Database["public"]["Enums"]["connection_source"]
          source_event_id: string | null
          strength: Database["public"]["Enums"]["connection_strength"]
          updated_at: string
        }
        Insert: {
          connection_type?: Database["public"]["Enums"]["connection_type"]
          created_at?: string
          id?: string
          introduced_by?: string | null
          notes?: string | null
          org_id: string
          profile_a_id: string
          profile_b_id: string
          source?: Database["public"]["Enums"]["connection_source"]
          source_event_id?: string | null
          strength?: Database["public"]["Enums"]["connection_strength"]
          updated_at?: string
        }
        Update: {
          connection_type?: Database["public"]["Enums"]["connection_type"]
          created_at?: string
          id?: string
          introduced_by?: string | null
          notes?: string | null
          org_id?: string
          profile_a_id?: string
          profile_b_id?: string
          source?: Database["public"]["Enums"]["connection_source"]
          source_event_id?: string | null
          strength?: Database["public"]["Enums"]["connection_strength"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_introduced_by_fkey"
            columns: ["introduced_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_profile_a_id_fkey"
            columns: ["profile_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_profile_b_id_fkey"
            columns: ["profile_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body: string | null
          created_at: string
          fts: unknown
          gmail_message_id: string
          id: string
          org_id: string
          recipients: Json
          sender: string | null
          sent_at: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          fts?: unknown
          gmail_message_id: string
          id?: string
          org_id: string
          recipients?: Json
          sender?: string | null
          sent_at?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          fts?: unknown
          gmail_message_id?: string
          id?: string
          org_id?: string
          recipients?: Json
          sender?: string | null
          sent_at?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_participant_reviews: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          org_id: string
          profile_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["participant_review_status"]
          thread_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          org_id: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          thread_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          org_id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_participant_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participant_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participant_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participant_reviews_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          created_at: string
          fts: unknown
          gmail_account_id: string
          gmail_thread_id: string
          id: string
          is_deleted: boolean
          last_message_at: string | null
          message_count: number
          org_id: string
          participants: Json
          project_label: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fts?: unknown
          gmail_account_id: string
          gmail_thread_id: string
          id?: string
          is_deleted?: boolean
          last_message_at?: string | null
          message_count?: number
          org_id: string
          participants?: Json
          project_label?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fts?: unknown
          gmail_account_id?: string
          gmail_thread_id?: string
          id?: string
          is_deleted?: boolean
          last_message_at?: string | null
          message_count?: number
          org_id?: string
          participants?: Json
          project_label?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          attended: boolean
          created_at: string
          event_id: string
          id: string
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          event_id: string
          id?: string
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          event_id?: string
          id?: string
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_accounts: {
        Row: {
          access_token: string
          account_email: string | null
          account_name: string | null
          connected_by: string
          created_at: string
          id: string
          last_sync_at: string | null
          metadata: Json
          org_id: string
          sync_enabled: boolean
          sync_progress: Json | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_email?: string | null
          account_name?: string | null
          connected_by: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          org_id: string
          sync_enabled?: boolean
          sync_progress?: Json | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_email?: string | null
          account_name?: string | null
          connected_by?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          org_id?: string
          sync_enabled?: boolean
          sync_progress?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_answer_ai_cache: {
        Row: {
          eventbrite_attendee_id: string
          field: string
          id: string
          org_id: string
          raw_answer: string
          result: Json
          updated_at: string
        }
        Insert: {
          eventbrite_attendee_id: string
          field: string
          id?: string
          org_id: string
          raw_answer: string
          result: Json
          updated_at?: string
        }
        Update: {
          eventbrite_attendee_id?: string
          field?: string
          id?: string
          org_id?: string
          raw_answer?: string
          result?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_answer_ai_cache_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_attendee_reviews: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          event_id: string
          eventbrite_attendee_id: string
          id: string
          mapped_fields: Json
          org_id: string
          profile_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["participant_review_status"]
          ticket_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          event_id: string
          eventbrite_attendee_id: string
          id?: string
          mapped_fields?: Json
          org_id: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          ticket_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          event_id?: string
          eventbrite_attendee_id?: string
          id?: string
          mapped_fields?: Json
          org_id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["participant_review_status"]
          ticket_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_attendee_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_attendee_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_attendee_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_attendee_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_profile_update_reviews: {
        Row: {
          created_at: string
          event_id: string
          eventbrite_attendee_id: string
          id: string
          org_id: string
          profile_id: string
          proposed_changes: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["profile_update_review_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          eventbrite_attendee_id: string
          id?: string
          org_id: string
          profile_id: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["profile_update_review_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          eventbrite_attendee_id?: string
          id?: string
          org_id?: string
          profile_id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["profile_update_review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_profile_update_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_profile_update_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_profile_update_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_profile_update_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_question_mappings: {
        Row: {
          created_at: string
          event_id: string
          eventbrite_question_id: string
          id: string
          org_id: string
          question_text: string
          target_field: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          eventbrite_question_id: string
          id?: string
          org_id: string
          question_text: string
          target_field?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          eventbrite_question_id?: string
          id?: string
          org_id?: string
          question_text?: string
          target_field?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_question_mappings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventbrite_question_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["event_type"]
          eventbrite_event_id: string | null
          fts: unknown
          id: string
          location: string | null
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date: string
          event_type?: Database["public"]["Enums"]["event_type"]
          eventbrite_event_id?: string | null
          fts?: unknown
          id?: string
          location?: string | null
          org_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          eventbrite_event_id?: string | null
          fts?: unknown
          id?: string
          location?: string | null
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          last_sync_at: string | null
          org_id: string
          refresh_token: string
          sync_cursor: string | null
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_sync_at?: string | null
          org_id: string
          refresh_token: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_sync_at?: string | null
          org_id?: string
          refresh_token?: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          dedup_status: Database["public"]["Enums"]["dedup_status"]
          error: string | null
          id: string
          import_id: string
          matched_profile_id: string | null
          normalized: Json
          org_id: string
          raw: Json
          row_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedup_status?: Database["public"]["Enums"]["dedup_status"]
          error?: string | null
          id?: string
          import_id: string
          matched_profile_id?: string | null
          normalized?: Json
          org_id: string
          raw?: Json
          row_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedup_status?: Database["public"]["Enums"]["dedup_status"]
          error?: string | null
          id?: string
          import_id?: string
          matched_profile_id?: string | null
          normalized?: Json
          org_id?: string
          raw?: Json
          row_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_matched_profile_id_fkey"
            columns: ["matched_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          created_by: string
          event_id: string | null
          filename: string
          id: string
          metadata: Json
          org_id: string
          row_count: number
          source: string
          status: Database["public"]["Enums"]["import_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id?: string | null
          filename: string
          id?: string
          metadata?: Json
          org_id: string
          row_count?: number
          source: string
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string | null
          filename?: string
          id?: string
          metadata?: Json
          org_id?: string
          row_count?: number
          source?: string
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      login_rate_limit_buckets: {
        Row: {
          attempt_count: number
          bucket_key: string
          reset_at: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          bucket_key: string
          reset_at: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          bucket_key?: string
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organisations: {
        Row: {
          created_at: string
          email_access_level: Database["public"]["Enums"]["email_access_level"]
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_access_level?: Database["public"]["Enums"]["email_access_level"]
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_access_level?: Database["public"]["Enums"]["email_access_level"]
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_tags: {
        Row: {
          created_at: string
          id: string
          org_id: string
          profile_id: string
          source: string
          tag_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          source?: string
          tag_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          source?: string
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_enrichment_generated_at: string | null
          ai_enrichment_source_hash: string | null
          bio: string | null
          company_size: string | null
          created_at: string
          email: string | null
          extended: Json
          fts: unknown
          full_name: string
          id: string
          linkedin_url: string | null
          location_city: string | null
          location_country: string | null
          notes_summary: string | null
          notes_summary_generated_at: string | null
          notes_summary_note_count: number | null
          occupation: string | null
          org_id: string
          organisation_name: string | null
          organisation_name_normalised: string | null
          phone: string | null
          source: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          ai_enrichment_generated_at?: string | null
          ai_enrichment_source_hash?: string | null
          bio?: string | null
          company_size?: string | null
          created_at?: string
          email?: string | null
          extended?: Json
          fts?: unknown
          full_name: string
          id?: string
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          notes_summary?: string | null
          notes_summary_generated_at?: string | null
          notes_summary_note_count?: number | null
          occupation?: string | null
          org_id: string
          organisation_name?: string | null
          organisation_name_normalised?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          ai_enrichment_generated_at?: string | null
          ai_enrichment_source_hash?: string | null
          bio?: string | null
          company_size?: string | null
          created_at?: string
          email?: string | null
          extended?: Json
          fts?: unknown
          full_name?: string
          id?: string
          linkedin_url?: string | null
          location_city?: string | null
          location_country?: string | null
          notes_summary?: string | null
          notes_summary_generated_at?: string | null
          notes_summary_note_count?: number | null
          occupation?: string | null
          org_id?: string
          organisation_name?: string | null
          organisation_name_normalised?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_owners: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          last_interaction_at: string | null
          notes: string | null
          org_id: string
          relationship_id: string
          strength: Database["public"]["Enums"]["owner_strength"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_interaction_at?: string | null
          notes?: string | null
          org_id: string
          relationship_id: string
          strength?: Database["public"]["Enums"]["owner_strength"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          last_interaction_at?: string | null
          notes?: string | null
          org_id?: string
          relationship_id?: string
          strength?: Database["public"]["Enums"]["owner_strength"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_owners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_owners_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_sources: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          relationship_id: string
          source_id: string | null
          source_label: string
          source_type: Database["public"]["Enums"]["relationship_source_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          relationship_id: string
          source_id?: string | null
          source_label: string
          source_type: Database["public"]["Enums"]["relationship_source_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          relationship_id?: string
          source_id?: string | null
          source_label?: string
          source_type?: Database["public"]["Enums"]["relationship_source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_sources_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          org_id: string
          profile_id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          status: Database["public"]["Enums"]["relationship_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          profile_id: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          profile_id?: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string
          created_at: string
          fts: unknown
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          fts?: unknown
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          fts?: unknown
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          org_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          org_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          org_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      email_messages_user: {
        Row: {
          body: string | null
          created_at: string | null
          gmail_message_id: string | null
          id: string | null
          org_id: string | null
          recipients: Json | null
          sender: string | null
          sent_at: string | null
          thread_id: string | null
          updated_at: string | null
        }
        Insert: {
          body?: never
          created_at?: string | null
          gmail_message_id?: string | null
          id?: string | null
          org_id?: string | null
          recipients?: Json | null
          sender?: string | null
          sent_at?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: never
          created_at?: string | null
          gmail_message_id?: string | null
          id?: string | null
          org_id?: string | null
          recipients?: Json | null
          sender?: string | null
          sent_at?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      search_index: {
        Row: {
          entity_type: string | null
          fts: unknown
          id: string | null
          org_id: string | null
          subtitle: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_is_admin: { Args: never; Returns: boolean }
      auth_org_id: { Args: never; Returns: string }
      consume_login_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      get_email_message_body: {
        Args: { p_message_id: string }
        Returns: string
      }
      get_last_activity_per_profile: {
        Args: { p_org_id: string }
        Returns: {
          activity_date: string
          profile_id: string
        }[]
      }
      get_latest_calendar_meetings_for_profiles: {
        Args: { p_before?: string; p_org_id: string; p_profile_ids: string[] }
        Returns: {
          activity_date: string
          profile_id: string
          source_ref: string
          title: string
        }[]
      }
      merge_one_profile_duplicate: {
        Args: {
          p_duplicate_id: string
          p_org_id: string
          p_survivor_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      merge_profiles_atomic: {
        Args: {
          p_duplicate_ids: string[]
          p_retained_email: string | null
          p_survivor_fields: Json
          p_survivor_id: string
        }
        Returns: number
      }
      normalise_organisation_name_sql: {
        Args: { p_name: string }
        Returns: string
      }
      org_has_full_body_access: { Args: { p_org_id: string }; Returns: boolean }
      pick_stronger_owner_strength: {
        Args: {
          left_strength: Database["public"]["Enums"]["owner_strength"]
          right_strength: Database["public"]["Enums"]["owner_strength"]
        }
        Returns: Database["public"]["Enums"]["owner_strength"]
      }
      profile_is_team_member: {
        Args: { p_email: string; p_org_id: string }
        Returns: boolean
      }
      search_email_message_bodies: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          gmail_message_id: string
          id: string
          rank: number
          sent_at: string
          thread_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_can_read_email_body: {
        Args: { p_org_id: string; p_thread_id: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_source:
        | "gmail_sync"
        | "calendar_sync"
        | "manual"
        | "event_system"
        | "import"
      activity_type:
        | "email"
        | "meeting"
        | "event"
        | "introduction"
        | "note"
        | "call"
        | "other"
      connection_source:
        | "manual"
        | "inferred_company"
        | "inferred_event"
        | "inferred_email"
        | "import"
      connection_strength: "strong" | "warm" | "weak" | "unknown"
      connection_type:
        | "colleague"
        | "cofounder"
        | "introduced"
        | "met_at_event"
        | "personal"
        | "unknown"
      dedup_status: "pending" | "matched_email" | "soft_match" | "new" | "error"
      email_access_level:
        | "metadata_only"
        | "restricted_body_access"
        | "full_body_access"
      event_type:
        | "dinner"
        | "roundtable"
        | "workshop"
        | "retreat"
        | "summit"
        | "other"
      import_status: "pending" | "processing" | "complete" | "failed"
      introduction_outcome:
        | "pending"
        | "accepted"
        | "led_to_meeting"
        | "no_response"
      owner_strength: "inner_circle" | "strong" | "warm" | "weak" | "unknown"
      participant_review_status: "pending" | "linked" | "created" | "ignored"
      profile_update_review_status: "pending" | "applied" | "ignored"
      relationship_source_type:
        | "csv_import"
        | "email"
        | "event_attendance"
        | "manual"
        | "introduction"
        | "meeting"
        | "other"
      relationship_status:
        | "prospect"
        | "active"
        | "partner"
        | "advisor"
        | "community"
        | "dormant"
        | "inactive"
      relationship_type:
        | "founder"
        | "investor"
        | "operator"
        | "advisor"
        | "partner"
        | "sponsor"
        | "media"
        | "other"
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
      activity_source: [
        "gmail_sync",
        "calendar_sync",
        "manual",
        "event_system",
        "import",
      ],
      activity_type: [
        "email",
        "meeting",
        "event",
        "introduction",
        "note",
        "call",
        "other",
      ],
      connection_source: [
        "manual",
        "inferred_company",
        "inferred_event",
        "inferred_email",
        "import",
      ],
      connection_strength: ["strong", "warm", "weak", "unknown"],
      connection_type: [
        "colleague",
        "cofounder",
        "introduced",
        "met_at_event",
        "personal",
        "unknown",
      ],
      dedup_status: ["pending", "matched_email", "soft_match", "new", "error"],
      email_access_level: [
        "metadata_only",
        "restricted_body_access",
        "full_body_access",
      ],
      event_type: [
        "dinner",
        "roundtable",
        "workshop",
        "retreat",
        "summit",
        "other",
      ],
      import_status: ["pending", "processing", "complete", "failed"],
      introduction_outcome: [
        "pending",
        "accepted",
        "led_to_meeting",
        "no_response",
      ],
      owner_strength: ["inner_circle", "strong", "warm", "weak", "unknown"],
      participant_review_status: ["pending", "linked", "created", "ignored"],
      profile_update_review_status: ["pending", "applied", "ignored"],
      relationship_source_type: [
        "csv_import",
        "email",
        "event_attendance",
        "manual",
        "introduction",
        "meeting",
        "other",
      ],
      relationship_status: [
        "prospect",
        "active",
        "partner",
        "advisor",
        "community",
        "dormant",
        "inactive",
      ],
      relationship_type: [
        "founder",
        "investor",
        "operator",
        "advisor",
        "partner",
        "sponsor",
        "media",
        "other",
      ],
    },
  },
} as const
