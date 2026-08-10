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
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
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
          patient_age: number | null
          patient_gender: string | null
          patient_name: string
          patient_phone: string
          payment_gateway: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          reschedule_count: number
          service_name: string
          status: Database["public"]["Enums"]["appointment_status"]
          time_slot: string
          token_number: string | null
          updated_at: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_start_url: string | null
        }
        Insert: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
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
          patient_age?: number | null
          patient_gender?: string | null
          patient_name: string
          patient_phone: string
          payment_gateway?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reschedule_count?: number
          service_name: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot: string
          token_number?: string | null
          updated_at?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_start_url?: string | null
        }
        Update: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
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
          patient_age?: number | null
          patient_gender?: string | null
          patient_name?: string
          patient_phone?: string
          payment_gateway?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reschedule_count?: number
          service_name?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot?: string
          token_number?: string | null
          updated_at?: string
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
        ]
      }
      blog_posts: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          doctor_id: string
          excerpt: string | null
          featured_image_url: string | null
          id: string
          is_published: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          doctor_id: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          doctor_id?: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
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
          created_at: string
          doctor_id: string
          gst_amount: number
          gst_rate: number
          id: string
          invoice_number: string
          patient_name: string
          service_name: string
          status: string
          total_amount: number
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          clinic_gstin?: string | null
          created_at?: string
          doctor_id: string
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number: string
          patient_name: string
          service_name: string
          status?: string
          total_amount?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          clinic_gstin?: string | null
          created_at?: string
          doctor_id?: string
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number?: string
          patient_name?: string
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
        ]
      }
      patient_vitals: {
        Row: {
          bmi: number | null
          blood_pressure: string | null
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
          bmi?: number | null
          blood_pressure?: string | null
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
          bmi?: number | null
          blood_pressure?: string | null
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
          created_at: string
          doctor_id: string
          email: string | null
          first_visit: string | null
          gender: string | null
          id: string
          last_visit: string | null
          name: string
          notes: string | null
          phone: string
          total_visits: number
          updated_at: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          doctor_id: string
          email?: string | null
          first_visit?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          name: string
          notes?: string | null
          phone: string
          total_visits?: number
          updated_at?: string
        }
        Update: {
          age?: number | null
          created_at?: string
          doctor_id?: string
          email?: string | null
          first_visit?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          notes?: string | null
          phone?: string
          total_visits?: number
          updated_at?: string
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
          appointment_id: string
          created_at: string
          currency: string
          doctor_id: string
          id: string
          is_mock: boolean
          method: string | null
          raw_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: Database["public"]["Enums"]["payment_txn_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id: string
          created_at?: string
          currency?: string
          doctor_id: string
          id?: string
          is_mock?: boolean
          method?: string | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          created_at?: string
          currency?: string
          doctor_id?: string
          id?: string
          is_mock?: boolean
          method?: string | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
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
      prescriptions: {
        Row: {
          created_at: string
          date: string
          diagnosis: string | null
          doctor_id: string
          id: string
          medications: string | null
          notes: string | null
          patient_age: number | null
          patient_id: string | null
          patient_name: string
          patient_weight: number | null
        }
        Insert: {
          created_at?: string
          date?: string
          diagnosis?: string | null
          doctor_id: string
          id?: string
          medications?: string | null
          notes?: string | null
          patient_age?: number | null
          patient_id?: string | null
          patient_name: string
          patient_weight?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          diagnosis?: string | null
          doctor_id?: string
          id?: string
          medications?: string | null
          notes?: string | null
          patient_age?: number | null
          patient_id?: string | null
          patient_name?: string
          patient_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          clinic_name: string | null
          consultation_fee: number
          created_at: string
          custom_plan_price: number | null
          experience_years: number | null
          full_name: string | null
          gst_registered: boolean
          gstin: string | null
          id: string
          onboarding_completed: boolean
          phone: string | null
          plan_status: Database["public"]["Enums"]["plan_status"]
          plan_tier: string
          profile_photo_url: string | null
          qualifications: string | null
          slug: string | null
          specialization: string | null
          trial_end: string | null
          trial_start: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          clinic_name?: string | null
          consultation_fee?: number
          created_at?: string
          custom_plan_price?: number | null
          experience_years?: number | null
          full_name?: string | null
          gst_registered?: boolean
          gstin?: string | null
          id: string
          onboarding_completed?: boolean
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          plan_tier?: string
          profile_photo_url?: string | null
          qualifications?: string | null
          slug?: string | null
          specialization?: string | null
          trial_end?: string | null
          trial_start?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          clinic_name?: string | null
          consultation_fee?: number
          created_at?: string
          custom_plan_price?: number | null
          experience_years?: number | null
          full_name?: string | null
          gst_registered?: boolean
          gstin?: string | null
          id?: string
          onboarding_completed?: boolean
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          plan_tier?: string
          profile_photo_url?: string | null
          qualifications?: string | null
          slug?: string | null
          specialization?: string | null
          trial_end?: string | null
          trial_start?: string
          updated_at?: string
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
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          doctor_id: string
          id: string
          metadata: Json | null
          notes: string | null
          priority: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          doctor_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          status?: string
          subject?: string
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
      website_settings: {
        Row: {
          auto_confirm: boolean
          blog_auto_enabled: boolean
          booking_advance_days: number
          buffer_minutes: number
          cancellation_cutoff_hours: number
          created_at: string
          doctor_id: string
          google_analytics_id: string | null
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
          show_online_consultation: boolean
          show_packages: boolean
          show_quick_stats: boolean
          show_reviews: boolean
          show_services: boolean
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
          auto_confirm?: boolean
          blog_auto_enabled?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          cancellation_cutoff_hours?: number
          created_at?: string
          doctor_id: string
          google_analytics_id?: string | null
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
          show_online_consultation?: boolean
          show_packages?: boolean
          show_quick_stats?: boolean
          show_reviews?: boolean
          show_services?: boolean
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
          auto_confirm?: boolean
          blog_auto_enabled?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          cancellation_cutoff_hours?: number
          created_at?: string
          doctor_id?: string
          google_analytics_id?: string | null
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
          show_online_consultation?: boolean
          show_packages?: boolean
          show_quick_stats?: boolean
          show_reviews?: boolean
          show_services?: boolean
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_appointment_by_token: {
        Args: { _doctor_id: string; _phone: string; _token: string }
        Returns: Json
      }
      doctor_has_premium_access: {
        Args: { _doctor_id: string }
        Returns: boolean
      }
      get_appointment_by_token: {
        Args: { _doctor_id: string; _phone: string; _token: string }
        Returns: {
          amount: number
          appointment_type: string
          chief_complaint: string
          created_at: string
          date: string
          doctor_id: string
          id: string
          meeting_link: string
          patient_name: string
          patient_phone: string
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
          appointments_used: number
          is_premium: boolean
        }[]
      }
      get_doctor_plan_status: { Args: { _doctor_id: string }; Returns: string }
      get_queue_position: { Args: { _appointment_id: string }; Returns: number }
      get_slot_counts: {
        Args: { _date: string; _doctor_id: string }
        Returns: {
          booked: number
          time_slot: string
        }[]
      }
      get_upcoming_checkup: {
        Args: { _doctor_id: string; _phone: string }
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
    }
    Enums: {
      app_role: "admin" | "doctor" | "staff"
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      payment_status: "pending" | "paid" | "refunded" | "pay_at_clinic"
      plan_status: "trial" | "active" | "expired" | "cancelled"
      condition_status: "active" | "under_treatment" | "resolved" | "unknown"
      medication_status: "active" | "completed"
      allergy_type: "drug" | "food" | "other"
      allergy_severity: "mild" | "moderate" | "severe"
      medical_document_type:
        | "lab_report"
        | "xray"
        | "mri"
        | "ct_scan"
        | "previous_prescription"
        | "other"
      payment_txn_status: "created" | "authorized" | "captured" | "failed" | "refunded"
      payout_status: "pending" | "processing" | "processed" | "failed" | "cancelled"
      checkup_frequency:
        | "weekly"
        | "every_15_days"
        | "monthly"
        | "every_3_months"
        | "every_6_months"
        | "yearly"
        | "custom"
      reminder_status: "active" | "paused" | "completed" | "cancelled"
      notification_channel: "whatsapp" | "sms" | "in_app"
      notification_status: "pending" | "processing" | "sent" | "failed" | "simulated"
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
      app_role: ["admin", "doctor", "staff"],
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      payment_status: ["pending", "paid", "refunded", "pay_at_clinic"],
      plan_status: ["trial", "active", "expired", "cancelled"],
      condition_status: ["active", "under_treatment", "resolved", "unknown"],
      medication_status: ["active", "completed"],
      allergy_type: ["drug", "food", "other"],
      allergy_severity: ["mild", "moderate", "severe"],
      medical_document_type: [
        "lab_report",
        "xray",
        "mri",
        "ct_scan",
        "previous_prescription",
        "other",
      ],
      payment_txn_status: ["created", "authorized", "captured", "failed", "refunded"],
      payout_status: ["pending", "processing", "processed", "failed", "cancelled"],
      checkup_frequency: [
        "weekly",
        "every_15_days",
        "monthly",
        "every_3_months",
        "every_6_months",
        "yearly",
        "custom",
      ],
      reminder_status: ["active", "paused", "completed", "cancelled"],
      notification_channel: ["whatsapp", "sms", "in_app"],
      notification_status: ["pending", "processing", "sent", "failed", "simulated"],
    },
  },
} as const
