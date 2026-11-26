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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          amount: number
          appointment_type: string
          chief_complaint: string | null
          completed_at: string | null
          created_at: string
          date: string
          doctor_id: string
          gateway_order_id: string | null
          gateway_payment_id: string | null
          gateway_signature: string | null
          id: string
          meeting_link: string | null
          meeting_provider: string | null
          meeting_status: string | null
          notes: string | null
          paid_at: string | null
          patient_age: number | null
          patient_email: string | null
          patient_gender: string | null
          patient_id: string | null
          patient_name: string
          patient_phone: string
          patient_weight: number | null
          payment_gateway: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          practitioner_id: string
          priority: number
          priority_reason: string | null
          queue_number: number | null
          reschedule_count: number
          service_name: string
          serving_started_at: string | null
          skipped_at: string | null
          sort_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          time_slot: string | null
          token_number: string | null
          updated_at: string
          visit_counted: boolean
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_start_url: string | null
        }
        Insert: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          date: string
          doctor_id: string
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          meeting_link?: string | null
          meeting_provider?: string | null
          meeting_status?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_age?: number | null
          patient_email?: string | null
          patient_gender?: string | null
          patient_id?: string | null
          patient_name: string
          patient_phone: string
          patient_weight?: number | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          practitioner_id?: string
          priority?: number
          priority_reason?: string | null
          queue_number?: number | null
          reschedule_count?: number
          service_name: string
          serving_started_at?: string | null
          skipped_at?: string | null
          sort_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot?: string | null
          token_number?: string | null
          updated_at?: string
          visit_counted?: boolean
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_start_url?: string | null
        }
        Update: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
          completed_at?: string | null
          created_at?: string
          date?: string
          doctor_id?: string
          gateway_order_id?: string | null
          gateway_payment_id?: string | null
          gateway_signature?: string | null
          id?: string
          meeting_link?: string | null
          meeting_provider?: string | null
          meeting_status?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_age?: number | null
          patient_email?: string | null
          patient_gender?: string | null
          patient_id?: string | null
          patient_name?: string
          patient_phone?: string
          patient_weight?: number | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          practitioner_id?: string
          priority?: number
          priority_reason?: string | null
          queue_number?: number | null
          reschedule_count?: number
          service_name?: string
          serving_started_at?: string | null
          skipped_at?: string | null
          sort_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot?: string | null
          token_number?: string | null
          updated_at?: string
          visit_counted?: boolean
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_start_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_assisted: boolean
          category: string | null
          content: string | null
          created_at: string
          doctor_id: string
          excerpt: string | null
          featured_image_url: string | null
          hub_hidden: boolean
          id: string
          is_published: boolean
          published_at: string | null
          slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_assisted?: boolean
          category?: string | null
          content?: string | null
          created_at?: string
          doctor_id: string
          excerpt?: string | null
          featured_image_url?: string | null
          hub_hidden?: boolean
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_assisted?: boolean
          category?: string | null
          content?: string | null
          created_at?: string
          doctor_id?: string
          excerpt?: string | null
          featured_image_url?: string | null
          hub_hidden?: boolean
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_doctor_seats: {
        Row: {
          doctor_id: string
          extra_seats: number
          reason: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          doctor_id: string
          extra_seats?: number
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          doctor_id?: string
          extra_seats?: number
          reason?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_doctor_seats_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_access_log: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          viewer_user_id: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          viewer_user_id: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_access_log_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_bank_accounts: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          created_at: string
          doctor_id: string
          id: string
          ifsc: string | null
          is_mock: boolean
          razorpay_contact_id: string | null
          razorpay_fund_account_id: string | null
          updated_at: string
          upi_id: string | null
          verified: boolean
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          ifsc?: string | null
          is_mock?: boolean
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          updated_at?: string
          upi_id?: string | null
          verified?: boolean
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          ifsc?: string | null
          is_mock?: boolean
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          updated_at?: string
          upi_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "doctor_bank_accounts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_custom_plans: {
        Row: {
          base_tier: string
          cancelled_by: string | null
          doctor_id: string
          extra_features: string[]
          monthly_appointments_limit: number | null
          monthly_price: number
          removed_features: string[]
          request_id: string | null
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          base_tier: string
          cancelled_by?: string | null
          doctor_id: string
          extra_features?: string[]
          monthly_appointments_limit?: number | null
          monthly_price: number
          removed_features?: string[]
          request_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          base_tier?: string
          cancelled_by?: string | null
          doctor_id?: string
          extra_features?: string[]
          monthly_appointments_limit?: number | null
          monthly_price?: number
          removed_features?: string[]
          request_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_custom_plans_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_custom_plans_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "plan_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_feature_overrides: {
        Row: {
          doctor_id: string
          enabled: boolean
          expires_at: string | null
          feature_key: string
          granted_at: string
          granted_by: string
          id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          doctor_id: string
          enabled: boolean
          expires_at?: string | null
          feature_key: string
          granted_at?: string
          granted_by: string
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          doctor_id?: string
          enabled?: boolean
          expires_at?: string | null
          feature_key?: string
          granted_at?: string
          granted_by?: string
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_feature_overrides_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_feature_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
        ]
      }
      doctor_ledger: {
        Row: {
          appointment_id: string
          commission_amount: number
          commission_percent: number
          created_at: string
          doctor_id: string
          doctor_share: number
          gross_amount: number
          id: string
          month: string
          paid: boolean
          payment_id: string
          payout_id: string | null
          refunded: boolean
          refunded_at: string | null
        }
        Insert: {
          appointment_id: string
          commission_amount: number
          commission_percent: number
          created_at?: string
          doctor_id: string
          doctor_share: number
          gross_amount: number
          id?: string
          month: string
          paid?: boolean
          payment_id: string
          payout_id?: string | null
          refunded?: boolean
          refunded_at?: string | null
        }
        Update: {
          appointment_id?: string
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          doctor_id?: string
          doctor_share?: number
          gross_amount?: number
          id?: string
          month?: string
          paid?: boolean
          payment_id?: string
          payout_id?: string | null
          refunded?: boolean
          refunded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_ledger_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_ledger_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_notes: {
        Row: {
          content: string
          created_at: string
          doctor_id: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string
          doctor_id: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string
          doctor_id?: string
          id?: string
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          assigned_to: string | null
          city: string | null
          clinic_name: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          clinic_name?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          clinic_name?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      features: {
        Row: {
          category: string
          default_min_tier: string
          description: string
          is_active: boolean
          is_requestable: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          category?: string
          default_min_tier?: string
          description: string
          is_active?: boolean
          is_requestable?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          default_min_tier?: string
          description?: string
          is_active?: boolean
          is_requestable?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      gallery_photos: {
        Row: {
          caption: string | null
          created_at: string
          doctor_id: string
          id: string
          photo_url: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          photo_url: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          photo_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_photos_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          appointment_id: string | null
          clinic_gstin: string | null
          commission_amount: number
          commission_percent: number
          created_at: string
          doctor_id: string
          gst_amount: number
          gst_rate: number
          id: string
          invoice_number: string
          net_amount: number | null
          patient_name: string
          payment_method: string | null
          payment_reference: string | null
          refunded_at: string | null
          service_name: string
          status: string
          total_amount: number
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          clinic_gstin?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          doctor_id: string
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number: string
          net_amount?: number | null
          patient_name: string
          payment_method?: string | null
          payment_reference?: string | null
          refunded_at?: string | null
          service_name: string
          status?: string
          total_amount?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          clinic_gstin?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          doctor_id?: string
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number?: string
          net_amount?: number | null
          patient_name?: string
          payment_method?: string | null
          payment_reference?: string | null
          refunded_at?: string | null
          service_name?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          doctor_id: string
          error_message: string | null
          id: string
          is_test: boolean
          message: string
          notification_type: string
          patient_id: string
          provider: string | null
          provider_message_id: string | null
          recipient: string | null
          reminder_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          doctor_id: string
          error_message?: string | null
          id?: string
          is_test?: boolean
          message: string
          notification_type?: string
          patient_id: string
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          reminder_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          doctor_id?: string
          error_message?: string | null
          id?: string
          is_test?: boolean
          message?: string
          notification_type?: string
          patient_id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          reminder_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "patient_checkup_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          is_read: boolean
          message: string
          recipient_user_id: string
          sender_id: string | null
          source_type: string
          ticket_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          is_read?: boolean
          message: string
          recipient_user_id: string
          sender_id?: string | null
          source_type: string
          ticket_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          is_read?: boolean
          message?: string
          recipient_user_id?: string
          sender_id?: string | null
          source_type?: string
          ticket_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          doctor_id: string
          duration: string | null
          features: Json | null
          id: string
          is_popular: boolean
          name: string
          original_price: number | null
          price: number
          slots_available: number | null
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          doctor_id: string
          duration?: string | null
          features?: Json | null
          id?: string
          is_popular?: boolean
          name: string
          original_price?: number | null
          price?: number
          slots_available?: number | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          doctor_id?: string
          duration?: string | null
          features?: Json | null
          id?: string
          is_popular?: boolean
          name?: string
          original_price?: number | null
          price?: number
          slots_available?: number | null
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          allergy_name: string
          allergy_type: Database["public"]["Enums"]["allergy_type"]
          created_at: string
          created_by: string
          deleted_at: string | null
          doctor_id: string
          id: string
          is_active: boolean
          notes: string | null
          patient_id: string
          reaction: string | null
          severity: Database["public"]["Enums"]["allergy_severity"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          allergy_name: string
          allergy_type?: Database["public"]["Enums"]["allergy_type"]
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id: string
          reaction?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
          updated_by?: string
        }
        Update: {
          allergy_name?: string
          allergy_type?: Database["public"]["Enums"]["allergy_type"]
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_checkup_reminders: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by: string
          custom_interval_days: number | null
          doctor_id: string
          frequency: Database["public"]["Enums"]["checkup_frequency"]
          id: string
          in_app_enabled: boolean
          last_reminder_sent_at: string | null
          medical_record_id: string | null
          next_checkup_date: string
          next_reminder_at: string
          patient_id: string
          reminder_before_days: number
          sms_enabled: boolean
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
          updated_by: string
          whatsapp_enabled: boolean
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by: string
          custom_interval_days?: number | null
          doctor_id: string
          frequency?: Database["public"]["Enums"]["checkup_frequency"]
          id?: string
          in_app_enabled?: boolean
          last_reminder_sent_at?: string | null
          medical_record_id?: string | null
          next_checkup_date: string
          next_reminder_at: string
          patient_id: string
          reminder_before_days?: number
          sms_enabled?: boolean
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
          updated_by: string
          whatsapp_enabled?: boolean
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          custom_interval_days?: number | null
          doctor_id?: string
          frequency?: Database["public"]["Enums"]["checkup_frequency"]
          id?: string
          in_app_enabled?: boolean
          last_reminder_sent_at?: string | null
          medical_record_id?: string | null
          next_checkup_date?: string
          next_reminder_at?: string
          patient_id?: string
          reminder_before_days?: number
          sms_enabled?: boolean
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
          updated_by?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "patient_checkup_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_checkup_reminders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_checkup_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_conditions: {
        Row: {
          condition_name: string
          created_at: string
          created_by: string
          deleted_at: string | null
          diagnosis_date: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["condition_status"]
          treatment_history: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          condition_name: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          diagnosis_date?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["condition_status"]
          treatment_history?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          condition_name?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          diagnosis_date?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["condition_status"]
          treatment_history?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_conditions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_documents: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          doctor_id: string
          document_date: string
          document_name: string
          document_type: Database["public"]["Enums"]["medical_document_type"]
          file_path: string
          file_type: string | null
          id: string
          notes: string | null
          patient_id: string
          practitioner_id: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id: string
          document_date?: string
          document_name: string
          document_type?: Database["public"]["Enums"]["medical_document_type"]
          file_path: string
          file_type?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          practitioner_id?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id?: string
          document_date?: string
          document_name?: string
          document_type?: Database["public"]["Enums"]["medical_document_type"]
          file_path?: string
          file_type?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          practitioner_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
          {
            foreignKeyName: "patient_documents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_family_history: {
        Row: {
          condition: string
          created_at: string
          created_by: string
          deleted_at: string | null
          doctor_id: string
          family_member: string
          id: string
          notes: string | null
          patient_id: string
          relationship: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          condition: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id: string
          family_member: string
          id?: string
          notes?: string | null
          patient_id: string
          relationship?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          condition?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id?: string
          family_member?: string
          id?: string
          notes?: string | null
          patient_id?: string
          relationship?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_family_history_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_family_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_import_overrides: {
        Row: {
          doctor_id: string
          mode: string
          reason: string
          set_at: string
          set_by: string
          until: string | null
        }
        Insert: {
          doctor_id: string
          mode: string
          reason: string
          set_at?: string
          set_by: string
          until?: string | null
        }
        Update: {
          doctor_id?: string
          mode?: string
          reason?: string
          set_at?: string
          set_by?: string
          until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_import_overrides_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_import_requests: {
        Row: {
          approved_cap: number | null
          cap_at_request: number
          created_at: string
          decided_at: string | null
          doctor_id: string
          doctor_note: string | null
          id: string
          patient_count: number
          requested_cap: number
          reviewer_id: string | null
          reviewer_note: string | null
          status: string
        }
        Insert: {
          approved_cap?: number | null
          cap_at_request?: number
          created_at?: string
          decided_at?: string | null
          doctor_id: string
          doctor_note?: string | null
          id?: string
          patient_count?: number
          requested_cap: number
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
        }
        Update: {
          approved_cap?: number | null
          cap_at_request?: number
          created_at?: string
          decided_at?: string | null
          doctor_id?: string
          doctor_note?: string | null
          id?: string
          patient_count?: number
          requested_cap?: number
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_import_requests_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_imports: {
        Row: {
          created_at: string
          doctor_id: string
          file_name: string | null
          id: string
          rows_duplicate: number
          rows_inserted: number
          rows_received: number
          rows_rejected: number
          user_id: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          file_name?: string | null
          id?: string
          rows_duplicate: number
          rows_inserted: number
          rows_received: number
          rows_rejected: number
          user_id: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          file_name?: string | null
          id?: string
          rows_duplicate?: number
          rows_inserted?: number
          rows_received?: number
          rows_rejected?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_imports_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_insert_counters: {
        Row: {
          bk_n: number
          bk_start: string
          day_n: number
          day_start: string
          doctor_id: string
          n: number
          window_start: string
        }
        Insert: {
          bk_n?: number
          bk_start?: string
          day_n?: number
          day_start?: string
          doctor_id: string
          n: number
          window_start: string
        }
        Update: {
          bk_n?: number
          bk_start?: string
          day_n?: number
          day_start?: string
          doctor_id?: string
          n?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_insert_counters_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          doctor_id: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          medicine_name: string
          patient_id: string
          prescribed_by: string | null
          purpose: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["medication_status"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_name: string
          patient_id: string
          prescribed_by?: string | null
          purpose?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
          updated_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medicine_name?: string
          patient_id?: string
          prescribed_by?: string | null
          purpose?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_queries: {
        Row: {
          created_at: string
          doctor_id: string
          email: string | null
          id: string
          message: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          email?: string | null
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          email?: string | null
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_queries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_surgeries: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          doctor_id: string
          event_date: string | null
          hospital: string | null
          id: string
          notes: string | null
          outcome: string | null
          patient_id: string
          reason: string | null
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id: string
          event_date?: string | null
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id: string
          reason?: string | null
          title: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          doctor_id?: string
          event_date?: string | null
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id?: string
          reason?: string | null
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_surgeries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_surgeries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_visits: {
        Row: {
          appointment_id: string | null
          consultation_type: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          diagnosis: string | null
          doctor_id: string
          doctor_notes: string | null
          follow_up_date: string | null
          id: string
          patient_id: string
          practitioner_id: string
          reason_for_visit: string | null
          symptoms: string | null
          updated_at: string
          updated_by: string
          visit_date: string
        }
        Insert: {
          appointment_id?: string | null
          consultation_type?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          diagnosis?: string | null
          doctor_id: string
          doctor_notes?: string | null
          follow_up_date?: string | null
          id?: string
          patient_id: string
          practitioner_id?: string
          reason_for_visit?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string
          visit_date?: string
        }
        Update: {
          appointment_id?: string | null
          consultation_type?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          diagnosis?: string | null
          doctor_id?: string
          doctor_notes?: string | null
          follow_up_date?: string | null
          id?: string
          patient_id?: string
          practitioner_id?: string
          reason_for_visit?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
        ]
      }
      patient_vitals: {
        Row: {
          blood_pressure: string | null
          bmi: number | null
          created_at: string
          created_by: string
          doctor_id: string
          height: number | null
          id: string
          patient_id: string
          pulse: number | null
          recorded_date: string
          respiratory_rate: number | null
          spo2: number | null
          temperature: number | null
          visit_id: string
          weight: number | null
        }
        Insert: {
          blood_pressure?: string | null
          bmi?: number | null
          created_at?: string
          created_by?: string
          doctor_id: string
          height?: number | null
          id?: string
          patient_id: string
          pulse?: number | null
          recorded_date?: string
          respiratory_rate?: number | null
          spo2?: number | null
          temperature?: number | null
          visit_id: string
          weight?: number | null
        }
        Update: {
          blood_pressure?: string | null
          bmi?: number | null
          created_at?: string
          created_by?: string
          doctor_id?: string
          height?: number | null
          id?: string
          patient_id?: string
          pulse?: number | null
          recorded_date?: string
          respiratory_rate?: number | null
          spo2?: number | null
          temperature?: number | null
          visit_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_vitals_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vitals_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number | null
          auto_created: boolean
          created_at: string
          doctor_id: string
          email: string | null
          first_visit: string | null
          gender: string | null
          id: string
          last_visit: string | null
          name: string
          notes: string | null
          patient_since: string | null
          phone: string
          total_visits: number
          updated_at: string
          weight: number | null
        }
        Insert: {
          age?: number | null
          auto_created?: boolean
          created_at?: string
          doctor_id: string
          email?: string | null
          first_visit?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          name: string
          notes?: string | null
          patient_since?: string | null
          phone: string
          total_visits?: number
          updated_at?: string
          weight?: number | null
        }
        Update: {
          age?: number | null
          auto_created?: boolean
          created_at?: string
          doctor_id?: string
          email?: string | null
          first_visit?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          notes?: string | null
          patient_since?: string | null
          phone?: string
          total_visits?: number
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          commission_amount: number
          commission_percent: number
          created_at: string
          currency: string
          doctor_id: string
          doctor_share: number
          id: string
          is_mock: boolean
          method: string | null
          needs_refund: boolean
          pending_booking: Json | null
          raw_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["payment_txn_status"]
          transfer_status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          currency?: string
          doctor_id: string
          doctor_share?: number
          id?: string
          is_mock?: boolean
          method?: string | null
          needs_refund?: boolean
          pending_booking?: Json | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
          transfer_status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          currency?: string
          doctor_id?: string
          doctor_share?: number
          id?: string
          is_mock?: boolean
          method?: string | null
          needs_refund?: boolean
          pending_booking?: Json | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
          transfer_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          created_at: string
          doctor_id: string
          failure_reason: string | null
          id: string
          initiated_by: string | null
          is_mock: boolean
          month: string
          notes: string | null
          razorpay_fund_account_id: string | null
          razorpay_payout_id: string | null
          status: Database["public"]["Enums"]["payout_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          is_mock?: boolean
          month: string
          notes?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_payout_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string | null
          is_mock?: boolean
          month?: string
          notes?: string | null
          razorpay_fund_account_id?: string | null
          razorpay_payout_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_plans: {
        Row: {
          activation_date: string
          created_at: string | null
          doctor_id: string
          id: string
          payment_id: string
          target_tier: string
        }
        Insert: {
          activation_date: string
          created_at?: string | null
          doctor_id: string
          id?: string
          payment_id: string
          target_tier: string
        }
        Update: {
          activation_date?: string
          created_at?: string | null
          doctor_id?: string
          id?: string
          payment_id?: string
          target_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_plans_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_plans_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "plan_upgrade_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json | null
          doctor_id: string
          event: string
          id: string
          request_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          doctor_id: string
          event: string
          id?: string
          request_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          doctor_id?: string
          event?: string
          id?: string
          request_id?: string | null
        }
        Relationships: []
      }
      plan_requests: {
        Row: {
          add_features: string[]
          approved_appointments_limit: number | null
          approved_features: string[] | null
          approved_price: number | null
          base_tier: string
          created_at: string
          decided_at: string | null
          doctor_id: string
          doctor_note: string | null
          id: string
          remove_features: string[]
          requested_appointments_limit: number | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          add_features?: string[]
          approved_appointments_limit?: number | null
          approved_features?: string[] | null
          approved_price?: number | null
          base_tier: string
          created_at?: string
          decided_at?: string | null
          doctor_id: string
          doctor_note?: string | null
          id?: string
          remove_features?: string[]
          requested_appointments_limit?: number | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          add_features?: string[]
          approved_appointments_limit?: number | null
          approved_features?: string[] | null
          approved_price?: number | null
          base_tier?: string
          created_at?: string
          decided_at?: string | null
          doctor_id?: string
          doctor_note?: string | null
          id?: string
          remove_features?: string[]
          requested_appointments_limit?: number | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_requests_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_upgrade_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          doctor_id: string
          from_tier: string
          id: string
          is_mock: boolean
          raw_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: Database["public"]["Enums"]["payment_txn_status"]
          target_tier: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          doctor_id: string
          from_tier: string
          id?: string
          is_mock?: boolean
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
          target_tier: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          doctor_id?: string
          from_tier?: string
          id?: string
          is_mock?: boolean
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
          target_tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_upgrade_payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      practitioners: {
        Row: {
          bio: string | null
          consultation_fee: number | null
          created_at: string
          directory_listed: boolean
          display_name: string
          doctor_id: string
          experience_years: number | null
          hpr_id: string | null
          id: string
          is_active: boolean
          is_bookable: boolean
          is_primary: boolean
          online_booking: boolean
          photo_url: string | null
          qualifications: string | null
          registration_number: string | null
          signature_url: string | null
          slot_duration_minutes: number | null
          slug: string
          sort_order: number
          specialization: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          consultation_fee?: number | null
          created_at?: string
          directory_listed?: boolean
          display_name: string
          doctor_id: string
          experience_years?: number | null
          hpr_id?: string | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          is_primary?: boolean
          online_booking?: boolean
          photo_url?: string | null
          qualifications?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slot_duration_minutes?: number | null
          slug: string
          sort_order?: number
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          consultation_fee?: number | null
          created_at?: string
          directory_listed?: boolean
          display_name?: string
          doctor_id?: string
          experience_years?: number | null
          hpr_id?: string | null
          id?: string
          is_active?: boolean
          is_bookable?: boolean
          is_primary?: boolean
          online_booking?: boolean
          photo_url?: string | null
          qualifications?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slot_duration_minutes?: number | null
          slug?: string
          sort_order?: number
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioners_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_shares: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          doctor_id: string
          expires_at: string
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          prescription_id: string
          revoked_at: string | null
          token_hash: string
          view_count: number
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          doctor_id: string
          expires_at?: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          prescription_id: string
          revoked_at?: string | null
          token_hash: string
          view_count?: number
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          doctor_id?: string
          expires_at?: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          prescription_id?: string
          revoked_at?: string | null
          token_hash?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescription_shares_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          advice: string | null
          created_at: string
          created_by: string | null
          date: string
          diagnosis: string | null
          diet_advice: string | null
          doctor_id: string
          follow_up_date: string | null
          follow_up_instructions: string | null
          id: string
          lifestyle_advice: string | null
          medications: string | null
          medicines: Json
          notes: string | null
          patient_age: number | null
          patient_id: string | null
          patient_name: string
          patient_weight: number | null
          practitioner_id: string
          visit_id: string | null
        }
        Insert: {
          advice?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          diagnosis?: string | null
          diet_advice?: string | null
          doctor_id: string
          follow_up_date?: string | null
          follow_up_instructions?: string | null
          id?: string
          lifestyle_advice?: string | null
          medications?: string | null
          medicines?: Json
          notes?: string | null
          patient_age?: number | null
          patient_id?: string | null
          patient_name: string
          patient_weight?: number | null
          practitioner_id?: string
          visit_id?: string | null
        }
        Update: {
          advice?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          diagnosis?: string | null
          diet_advice?: string | null
          doctor_id?: string
          follow_up_date?: string | null
          follow_up_instructions?: string | null
          id?: string
          lifestyle_advice?: string | null
          medications?: string | null
          medicines?: Json
          notes?: string | null
          patient_age?: number | null
          patient_id?: string | null
          patient_name?: string
          patient_weight?: number | null
          practitioner_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
          {
            foreignKeyName: "prescriptions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          bio: string | null
          city: string | null
          clinic_email: string | null
          clinic_name: string | null
          commission_percent: number | null
          consultation_fee: number
          created_at: string
          custom_plan_price: number | null
          directory_listed: boolean
          experience_years: number | null
          full_name: string | null
          google_maps_url: string | null
          gst_registered: boolean
          gstin: string | null
          id: string
          locality: string | null
          onboarding_completed: boolean
          phone: string | null
          pincode: string | null
          plan_end: string | null
          plan_status: Database["public"]["Enums"]["plan_status"]
          plan_tier: string
          profile_photo_url: string | null
          qualifications: string | null
          razorpay_account_id: string | null
          razorpay_account_status: string
          razorpay_last_synced_at: string | null
          razorpay_onboarding_error: string | null
          razorpay_payment_enabled: boolean
          razorpay_product_id: string | null
          razorpay_stakeholder_id: string | null
          registration_number: string | null
          signature_url: string | null
          slug: string | null
          specialization: string | null
          state: string | null
          trial_end: string | null
          trial_start: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bio?: string | null
          city?: string | null
          clinic_email?: string | null
          clinic_name?: string | null
          commission_percent?: number | null
          consultation_fee?: number
          created_at?: string
          custom_plan_price?: number | null
          directory_listed?: boolean
          experience_years?: number | null
          full_name?: string | null
          google_maps_url?: string | null
          gst_registered?: boolean
          gstin?: string | null
          id: string
          locality?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          pincode?: string | null
          plan_end?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          plan_tier?: string
          profile_photo_url?: string | null
          qualifications?: string | null
          razorpay_account_id?: string | null
          razorpay_account_status?: string
          razorpay_last_synced_at?: string | null
          razorpay_onboarding_error?: string | null
          razorpay_payment_enabled?: boolean
          razorpay_product_id?: string | null
          razorpay_stakeholder_id?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slug?: string | null
          specialization?: string | null
          state?: string | null
          trial_end?: string | null
          trial_start?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bio?: string | null
          city?: string | null
          clinic_email?: string | null
          clinic_name?: string | null
          commission_percent?: number | null
          consultation_fee?: number
          created_at?: string
          custom_plan_price?: number | null
          directory_listed?: boolean
          experience_years?: number | null
          full_name?: string | null
          google_maps_url?: string | null
          gst_registered?: boolean
          gstin?: string | null
          id?: string
          locality?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          pincode?: string | null
          plan_end?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          plan_tier?: string
          profile_photo_url?: string | null
          qualifications?: string | null
          razorpay_account_id?: string | null
          razorpay_account_status?: string
          razorpay_last_synced_at?: string | null
          razorpay_onboarding_error?: string | null
          razorpay_payment_enabled?: boolean
          razorpay_product_id?: string | null
          razorpay_stakeholder_id?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slug?: string | null
          specialization?: string | null
          state?: string | null
          trial_end?: string | null
          trial_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      queue_events: {
        Row: {
          action: string
          actor_id: string | null
          appointment_id: string | null
          created_at: string
          doctor_id: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_events_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          is_pinned: boolean
          is_verified: boolean
          is_visible: boolean
          patient_name: string
          rating: number
          review_text: string | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          is_pinned?: boolean
          is_verified?: boolean
          is_visible?: boolean
          patient_name: string
          rating: number
          review_text?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          is_pinned?: boolean
          is_verified?: boolean
          is_visible?: boolean
          patient_name?: string
          rating?: number
          review_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          doctor_id: string
          duration: number | null
          id: string
          name: string
          price: number
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          doctor_id: string
          duration?: number | null
          id?: string
          name: string
          price?: number
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          doctor_id?: string
          duration?: number | null
          id?: string
          name?: string
          price?: number
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          created_at: string
          fee: number | null
          id: string
          processed_at: string | null
          razorpay_settlement_id: string | null
          status: string
          tax: number | null
          transfer_id: string
          updated_at: string
          utr: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          fee?: number | null
          id?: string
          processed_at?: string | null
          razorpay_settlement_id?: string | null
          status?: string
          tax?: number | null
          transfer_id: string
          updated_at?: string
          utr?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          fee?: number | null
          id?: string
          processed_at?: string | null
          razorpay_settlement_id?: string | null
          status?: string
          tax?: number | null
          transfer_id?: string
          updated_at?: string
          utr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      slug_history: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          old_slug: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          old_slug: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          old_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "slug_history_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          created_by: string
          doctor_id: string
          id: string
          last_login_at: string | null
          permissions: Json
          phone: string
          practitioner_id: string | null
          role: string
          staff_name: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by: string
          doctor_id: string
          id: string
          last_login_at?: string | null
          permissions?: Json
          phone: string
          practitioner_id?: string | null
          role?: string
          staff_name: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string
          doctor_id?: string
          id?: string
          last_login_at?: string | null
          permissions?: Json
          phone?: string
          practitioner_id?: string | null
          role?: string
          staff_name?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
        ]
      }
      superadmin_team_members: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_login_at: string | null
          name: string
          permissions: Json
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          last_login_at?: string | null
          name: string
          permissions?: Json
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_login_at?: string | null
          name?: string
          permissions?: Json
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          doctor_id: string
          id: string
          metadata: Json | null
          notes: string | null
          priority: string
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          status: string
          subject: string
          submitted_by_name: string
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          doctor_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          status?: string
          subject: string
          submitted_by_name?: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          status?: string
          subject?: string
          submitted_by_name?: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_lookup_attempts: {
        Row: {
          doctor_id: string
          failures: number
          phone: string
          window_start: string
        }
        Insert: {
          doctor_id: string
          failures?: number
          phone: string
          window_start?: string
        }
        Update: {
          doctor_id?: string
          failures?: number
          phone?: string
          window_start?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          appointment_id: string | null
          commission_amount: number | null
          commission_percent: number | null
          created_at: string
          currency: string
          doctor_id: string
          error: string | null
          gross_amount: number | null
          id: string
          is_mock: boolean
          payment_id: string
          processed_at: string | null
          razorpay_account_id: string
          razorpay_transfer_id: string | null
          reversed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          commission_amount?: number | null
          commission_percent?: number | null
          created_at?: string
          currency?: string
          doctor_id: string
          error?: string | null
          gross_amount?: number | null
          id?: string
          is_mock?: boolean
          payment_id: string
          processed_at?: string | null
          razorpay_account_id: string
          razorpay_transfer_id?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          commission_amount?: number | null
          commission_percent?: number | null
          created_at?: string
          currency?: string
          doctor_id?: string
          error?: string | null
          gross_amount?: number | null
          id?: string
          is_mock?: boolean
          payment_id?: string
          processed_at?: string | null
          razorpay_account_id?: string
          razorpay_transfer_id?: string | null
          reversed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
          razorpay_event_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          razorpay_event_id: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          razorpay_event_id?: string
          status?: string
        }
        Relationships: []
      }
      website_settings: {
        Row: {
          about_photo_url: string | null
          auto_confirm: boolean
          blog_auto_enabled: boolean
          booking_advance_days: number
          buffer_minutes: number
          cancellation_cutoff_hours: number
          clinical_visibility: string
          created_at: string
          doctor_id: string
          google_analytics_id: string | null
          hero_description: string
          hero_directions_label: string
          hero_headline_line1: string
          hero_headline_line2: string
          hero_hours_label: string
          hero_location_label: string
          hero_photo_url: string | null
          hero_primary_button_label: string
          hero_secondary_button_label: string
          hero_stat_icon: string
          hero_stat_text: string
          id: string
          max_per_slot: number
          online_duration: number | null
          online_fee: number | null
          payment_gateway_enabled: boolean
          razorpay_key_id: string | null
          require_payment: boolean
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          show_about: boolean
          show_blog: boolean
          show_clinic_details: boolean
          show_gallery: boolean
          show_hero_stat_badge: boolean
          show_online_consultation: boolean
          show_packages: boolean
          show_quick_stats: boolean
          show_reviews: boolean
          show_services: boolean
          slot_duration_minutes: number
          social_facebook: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_youtube: string | null
          theme: string
          updated_at: string
          video_provider: string | null
          whatsapp_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          about_photo_url?: string | null
          auto_confirm?: boolean
          blog_auto_enabled?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          cancellation_cutoff_hours?: number
          clinical_visibility?: string
          created_at?: string
          doctor_id: string
          google_analytics_id?: string | null
          hero_description?: string
          hero_directions_label?: string
          hero_headline_line1?: string
          hero_headline_line2?: string
          hero_hours_label?: string
          hero_location_label?: string
          hero_photo_url?: string | null
          hero_primary_button_label?: string
          hero_secondary_button_label?: string
          hero_stat_icon?: string
          hero_stat_text?: string
          id?: string
          max_per_slot?: number
          online_duration?: number | null
          online_fee?: number | null
          payment_gateway_enabled?: boolean
          razorpay_key_id?: string | null
          require_payment?: boolean
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          show_about?: boolean
          show_blog?: boolean
          show_clinic_details?: boolean
          show_gallery?: boolean
          show_hero_stat_badge?: boolean
          show_online_consultation?: boolean
          show_packages?: boolean
          show_quick_stats?: boolean
          show_reviews?: boolean
          show_services?: boolean
          slot_duration_minutes?: number
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_youtube?: string | null
          theme?: string
          updated_at?: string
          video_provider?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          about_photo_url?: string | null
          auto_confirm?: boolean
          blog_auto_enabled?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          cancellation_cutoff_hours?: number
          clinical_visibility?: string
          created_at?: string
          doctor_id?: string
          google_analytics_id?: string | null
          hero_description?: string
          hero_directions_label?: string
          hero_headline_line1?: string
          hero_headline_line2?: string
          hero_hours_label?: string
          hero_location_label?: string
          hero_photo_url?: string | null
          hero_primary_button_label?: string
          hero_secondary_button_label?: string
          hero_stat_icon?: string
          hero_stat_text?: string
          id?: string
          max_per_slot?: number
          online_duration?: number | null
          online_fee?: number | null
          payment_gateway_enabled?: boolean
          razorpay_key_id?: string | null
          require_payment?: boolean
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          show_about?: boolean
          show_blog?: boolean
          show_clinic_details?: boolean
          show_gallery?: boolean
          show_hero_stat_badge?: boolean
          show_online_consultation?: boolean
          show_packages?: boolean
          show_quick_stats?: boolean
          show_reviews?: boolean
          show_services?: boolean
          slot_duration_minutes?: number
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_youtube?: string | null
          theme?: string
          updated_at?: string
          video_provider?: string | null
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_settings_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          day_of_week: number
          doctor_id: string
          end_time: string | null
          end_time_2: string | null
          id: string
          is_open: boolean
          practitioner_id: string
          start_time: string | null
          start_time_2: string | null
        }
        Insert: {
          day_of_week: number
          doctor_id: string
          end_time?: string | null
          end_time_2?: string | null
          id?: string
          is_open?: boolean
          practitioner_id?: string
          start_time?: string | null
          start_time_2?: string | null
        }
        Update: {
          day_of_week?: number
          doctor_id?: string
          end_time?: string | null
          end_time_2?: string | null
          id?: string
          is_open?: boolean
          practitioner_id?: string
          start_time?: string | null
          start_time_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_practitioner_fk"
            columns: ["practitioner_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id", "doctor_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_scheduled_plans: { Args: never; Returns: undefined }
      admin_delete_auth_user: { Args: { _user_id: string }; Returns: undefined }
      admin_verify_password: {
        Args: { _password: string; _user_id: string }
        Returns: boolean
      }
      apply_plan_upgrade_payment: {
        Args: {
          _payment_id: string
          _razorpay_payment_id: string
          _signature?: string
        }
        Returns: Json
      }
      blog_facets: {
        Args: never
        Returns: {
          label: string
          post_count: number
          slug: string
        }[]
      }
      can_share_prescription: { Args: { _doctor_id: string }; Returns: boolean }
      cancel_appointment_by_token: {
        Args: { _doctor_id: string; _phone: string; _token: string }
        Returns: Json
      }
      cancel_custom_plan: { Args: { _doctor_id: string }; Returns: undefined }
      clinic_doctor_seat_limit: {
        Args: { _doctor_id: string }
        Returns: number
      }
      clinic_multi_doctor_enabled: {
        Args: { _doctor_id: string }
        Returns: boolean
      }
      clinical_row_visible: {
        Args: {
          _doctor_id: string
          _patient_id: string
          _practitioner_id: string
        }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      create_prescription_share: {
        Args: { _prescription_id: string }
        Returns: Json
      }
      directory_facets: {
        Args: { p_city?: string }
        Returns: {
          doctor_count: number
          kind: string
          label: string
          slug: string
        }[]
      }
      directory_slugify: { Args: { t: string }; Returns: string }
      doctor_active_custom_plan: {
        Args: { _doctor_id: string }
        Returns: {
          base_tier: string
          cancelled_by: string | null
          doctor_id: string
          extra_features: string[]
          monthly_appointments_limit: number | null
          monthly_price: number
          removed_features: string[]
          request_id: string | null
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "doctor_custom_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      doctor_has_feature: {
        Args: { _doctor_id: string; _feature_key: string }
        Returns: boolean
      }
      doctor_has_live_plan: { Args: { _doctor_id: string }; Returns: boolean }
      doctor_has_premium_access: {
        Args: { _doctor_id: string }
        Returns: boolean
      }
      doctor_monthly_appointment_limit: {
        Args: { _doctor_id: string }
        Returns: number
      }
      doctor_tier_default: {
        Args: { _doctor_id: string; _feature_key: string }
        Returns: boolean
      }
      ensure_invoice_for_appointment: {
        Args: { _appointment_id: string }
        Returns: undefined
      }
      ensure_primary_practitioner: {
        Args: { _doctor_id: string }
        Returns: string
      }
      expire_abandoned_plan_orders: { Args: never; Returns: number }
      expire_custom_plans: { Args: never; Returns: undefined }
      expire_overdue_appointments: { Args: never; Returns: number }
      expire_paid_plans: { Args: never; Returns: undefined }
      expire_trials: { Args: never; Returns: number }
      get_appointment_by_token: {
        Args: { _doctor_id: string; _phone: string; _token: string }
        Returns: {
          amount: number
          appointment_type: string
          chief_complaint: string
          created_at: string
          date: string
          doctor_id: string
          gateway_order_id: string
          gateway_payment_id: string
          id: string
          meeting_link: string
          paid_at: string
          patient_name: string
          patient_phone: string
          payment_gateway: string
          payment_method: string
          payment_status: string
          practitioner_id: string
          practitioner_name: string
          reschedule_count: number
          service_name: string
          status: string
          time_slot: string
          token_number: string
        }[]
      }
      get_appointment_cap_usage: {
        Args: { _doctor_id: string }
        Returns: {
          appointments_cap: number
          appointments_unlimited: boolean
          appointments_used: number
          is_premium: boolean
          standard_cap: number
        }[]
      }
      get_clinic_doctor_access: { Args: { _doctor_id: string }; Returns: Json }
      get_doctor_feature_access: {
        Args: { _doctor_id: string }
        Returns: {
          custom_plan_effect: string
          default_min_tier: string
          description: string
          effective_enabled: boolean
          feature_key: string
          included_by_plan: boolean
          is_requestable: boolean
          label: string
          override_active: boolean
          override_enabled: boolean
          override_expires_at: string
          override_granted_at: string
          override_granted_by: string
          override_reason: string
          source: string
        }[]
      }
      get_doctor_import_access: { Args: { _doctor_id: string }; Returns: Json }
      get_doctor_plan_details: {
        Args: { _doctor_id: string }
        Returns: {
          plan_end: string
          plan_status: string
          trial_end: string
        }[]
      }
      get_doctor_plan_status: { Args: { _doctor_id: string }; Returns: string }
      get_my_queue_status: {
        Args: { _doctor_id: string; _phone: string; _token: string }
        Returns: Json
      }
      get_or_create_dev_user:
        | {
            Args: { _full_name?: string; _phone: string }
            Returns: {
              email: string
              password: string
              user_id: string
            }[]
          }
        | {
            Args: { _full_name?: string; _is_signup?: boolean; _phone: string }
            Returns: {
              email: string
              password: string
              user_id: string
            }[]
          }
      get_patient_import_access: { Args: never; Returns: Json }
      get_public_feature_flags: {
        Args: { _doctor_id: string }
        Returns: {
          effective_enabled: boolean
          feature_key: string
        }[]
      }
      get_public_practitioners: {
        Args: { _doctor_id: string }
        Returns: {
          bio: string
          bookable: boolean
          consultation_fee: number
          display_name: string
          experience_years: number
          id: string
          is_owner: boolean
          is_primary: boolean
          online_booking: boolean
          photo_url: string
          qualifications: string
          registration_number: string
          slot_duration_minutes: number
          slug: string
          sort_order: number
          specialization: string
        }[]
      }
      get_public_queue: {
        Args: { _doctor_id: string; _practitioner_id?: string }
        Returns: Json
      }
      get_queue_position: { Args: { _appointment_id: string }; Returns: number }
      get_shared_prescription: {
        Args: { _phone_last4: string; _token: string }
        Returns: Json
      }
      get_slot_counts: {
        Args: {
          _appointment_type?: string
          _date: string
          _doctor_id: string
          _practitioner_id?: string
        }
        Returns: {
          booked: number
          time_slot: string
        }[]
      }
      get_upcoming_checkup: {
        Args: { _doctor_id: string; _phone: string; _token?: string }
        Returns: {
          doctor_name: string
          frequency: Database["public"]["Enums"]["checkup_frequency"]
          next_checkup_date: string
          reminder_enabled: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_patients: {
        Args: { _file_name?: string; _rows: Json }
        Returns: Json
      }
      is_active_team_member: { Args: { _user_id: string }; Returns: boolean }
      is_doctor_login: { Args: { _doctor_id: string }; Returns: boolean }
      log_clinical_access: { Args: { _patient_id: string }; Returns: undefined }
      my_practitioner_id: { Args: { _doctor_id: string }; Returns: string }
      patient_import_cap: { Args: { _doctor_id: string }; Returns: number }
      patient_import_clinic: { Args: never; Returns: string }
      patient_import_eligible: {
        Args: { _doctor_id: string }
        Returns: boolean
      }
      patient_import_row_error: { Args: { _r: Json }; Returns: string }
      phone_owns_clinic: { Args: { _digits: string }; Returns: boolean }
      platform_int_setting: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      practitioner_filled_by_trigger: { Args: never; Returns: string }
      practitioner_manager_clinic: { Args: never; Returns: string }
      practitioner_seat_rank: {
        Args: { _practitioner_id: string }
        Returns: number
      }
      practitioner_within_seats: {
        Args: { _practitioner_id: string }
        Returns: boolean
      }
      prescription_row_visible: {
        Args: { _prescription_id: string }
        Returns: boolean
      }
      primary_practitioner_id: { Args: { _doctor_id: string }; Returns: string }
      public_booking_price: {
        Args: {
          _doctor_id: string
          _practitioner_id?: string
          _service_name: string
          _type: string
        }
        Returns: number
      }
      queue_action: {
        Args: {
          _action: string
          _appointment_id?: string
          _expect?: string
          _payment_method?: string
          _payment_reference?: string
          _practitioner_id?: string
          _reason?: string
        }
        Returns: Json
      }
      queue_action_core: {
        Args: {
          _action: string
          _appointment_id: string
          _expect: string
          _payment_method: string
          _practitioner_id: string
          _reason: string
        }
        Returns: Json
      }
      reassign_practitioner_appointments: {
        Args: { _from: string; _from_date?: string; _to: string }
        Returns: Json
      }
      rebase_custom_plan: { Args: { _doctor_id: string }; Returns: undefined }
      release_provisional_patient: { Args: { _pid: string }; Returns: boolean }
      request_patient_import_limit: {
        Args: { _note?: string; _requested: number }
        Returns: Json
      }
      reschedule_appointment_by_token: {
        Args: {
          _doctor_id: string
          _new_date: string
          _new_time: string
          _phone: string
          _token: string
        }
        Returns: Json
      }
      review_patient_import_request: {
        Args: {
          _approved_cap?: number
          _decision: string
          _note?: string
          _request_id: string
        }
        Returns: undefined
      }
      review_plan_request: {
        Args: {
          _appointments_limit?: number
          _approved_features?: string[]
          _decision: string
          _note?: string
          _price?: number
          _request_id: string
          _valid_from?: string
          _valid_until?: string
        }
        Returns: undefined
      }
      revoke_prescription_share: {
        Args: { _prescription_id: string }
        Returns: undefined
      }
      revoke_user_sessions: { Args: { _user_id: string }; Returns: undefined }
      sa_has_any_permission: {
        Args: { _permissions: string[]; _user_id: string }
        Returns: boolean
      }
      sa_has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      search_blog_posts: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          category: string
          doctor_city: string
          doctor_name: string
          doctor_photo_url: string
          doctor_slug: string
          doctor_specialization: string
          excerpt: string
          featured_image_url: string
          id: string
          published_at: string
          reading_minutes: number
          slug: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      search_doctors: {
        Args: {
          p_city?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_specialty?: string
        }
        Returns: {
          avg_rating: number
          city: string
          clinic_name: string
          consultation_fee: number
          experience_years: number
          full_name: string
          id: string
          locality: string
          profile_photo_url: string
          qualifications: string
          review_count: number
          slug: string
          specialization: string
          state: string
          total_count: number
        }[]
      }
      send_plan_expiry_notifications: { Args: never; Returns: undefined }
      send_trial_warning_notifications: { Args: never; Returns: undefined }
      set_clinic_doctor_seats: {
        Args: { _doctor_id: string; _extra: number; _reason: string }
        Returns: Json
      }
      set_custom_plan_appointments_limit: {
        Args: { _doctor_id: string; _limit: number }
        Returns: undefined
      }
      set_patient_import_override: {
        Args: {
          _doctor_id: string
          _mode: string
          _reason?: string
          _until?: string
        }
        Returns: undefined
      }
      set_practitioner_status: {
        Args: { _id: string; _is_active: boolean; _is_bookable: boolean }
        Returns: Json
      }
      set_primary_practitioner: { Args: { _id: string }; Returns: Json }
      slot_lock_key: {
        Args: {
          _date: string
          _practitioner_id: string
          _time: string
          _type: string
        }
        Returns: number
      }
      staff_doctor_id: { Args: { _user_id: string }; Returns: string }
      staff_has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      storage_patient_object_visible: {
        Args: { _name: string }
        Returns: boolean
      }
      submit_plan_request: {
        Args: {
          _add: string[]
          _appointments_limit?: number
          _note?: string
          _remove: string[]
        }
        Returns: string
      }
      token_lookup_blocked: {
        Args: { _doctor_id: string; _phone: string }
        Returns: boolean
      }
      token_lookup_failed: {
        Args: { _doctor_id: string; _phone: string }
        Returns: undefined
      }
      token_lookup_ok: {
        Args: { _doctor_id: string; _phone: string }
        Returns: undefined
      }
      touch_staff_login: { Args: never; Returns: undefined }
      touch_team_login: { Args: never; Returns: undefined }
      uncount_patient_visit: {
        Args: { _appt: string; _pid: string }
        Returns: undefined
      }
      update_custom_plan_terms: {
        Args: { _doctor_id: string; _price: number; _valid_until: string }
        Returns: undefined
      }
      upsert_practitioner: { Args: { _data: Json; _id: string }; Returns: Json }
      withdraw_plan_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      allergy_severity: "mild" | "moderate" | "severe"
      allergy_type: "drug" | "food" | "other"
      app_role: "admin" | "doctor" | "staff"
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      checkup_frequency:
        | "weekly"
        | "every_15_days"
        | "monthly"
        | "every_3_months"
        | "every_6_months"
        | "yearly"
        | "custom"
      condition_status: "active" | "under_treatment" | "resolved" | "unknown"
      medical_document_type:
        | "lab_report"
        | "xray"
        | "mri"
        | "ct_scan"
        | "previous_prescription"
        | "other"
        | "discharge_summary"
        | "ecg"
        | "ultrasound"
      medication_status: "active" | "completed"
      notification_channel: "whatsapp" | "sms" | "in_app"
      notification_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "simulated"
      payment_status: "pending" | "paid" | "refunded" | "pay_at_clinic"
      payment_txn_status:
        | "created"
        | "authorized"
        | "captured"
        | "failed"
        | "refunded"
        | "abandoned"
      payout_status:
        | "pending"
        | "processing"
        | "processed"
        | "failed"
        | "cancelled"
      plan_status: "trial" | "active" | "expired" | "cancelled"
      reminder_status: "active" | "paused" | "completed" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      allergy_severity: ["mild", "moderate", "severe"],
      allergy_type: ["drug", "food", "other"],
      app_role: ["admin", "doctor", "staff"],
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      checkup_frequency: [
        "weekly",
        "every_15_days",
        "monthly",
        "every_3_months",
        "every_6_months",
        "yearly",
        "custom",
      ],
      condition_status: ["active", "under_treatment", "resolved", "unknown"],
      medical_document_type: [
        "lab_report",
        "xray",
        "mri",
        "ct_scan",
        "previous_prescription",
        "other",
        "discharge_summary",
        "ecg",
        "ultrasound",
      ],
      medication_status: ["active", "completed"],
      notification_channel: ["whatsapp", "sms", "in_app"],
      notification_status: [
        "pending",
        "processing",
        "sent",
        "failed",
        "simulated",
      ],
      payment_status: ["pending", "paid", "refunded", "pay_at_clinic"],
      payment_txn_status: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
        "abandoned",
      ],
      payout_status: [
        "pending",
        "processing",
        "processed",
        "failed",
        "cancelled",
      ],
      plan_status: ["trial", "active", "expired", "cancelled"],
      reminder_status: ["active", "paused", "completed", "cancelled"],
    },
  },
} as const
