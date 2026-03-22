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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          amount: number
          appointment_type: string
          chief_complaint: string | null
          created_at: string
          date: string
          doctor_id: string
          id: string
          notes: string | null
          patient_age: number | null
          patient_gender: string | null
          patient_name: string
          patient_phone: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          service_name: string
          status: Database["public"]["Enums"]["appointment_status"]
          time_slot: string
          token_number: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
          created_at?: string
          date: string
          doctor_id: string
          id?: string
          notes?: string | null
          patient_age?: number | null
          patient_gender?: string | null
          patient_name: string
          patient_phone: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          service_name: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot: string
          token_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_type?: string
          chief_complaint?: string | null
          created_at?: string
          date?: string
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_age?: number | null
          patient_gender?: string | null
          patient_name?: string
          patient_phone?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          service_name?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          time_slot?: string
          token_number?: string | null
          updated_at?: string
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
      prescriptions: {
        Row: {
          created_at: string
          date: string
          diagnosis: string | null
          doctor_id: string
          id: string
          medications: string | null
          notes: string | null
          patient_id: string | null
          patient_name: string
        }
        Insert: {
          created_at?: string
          date?: string
          diagnosis?: string | null
          doctor_id: string
          id?: string
          medications?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name: string
        }
        Update: {
          created_at?: string
          date?: string
          diagnosis?: string | null
          doctor_id?: string
          id?: string
          medications?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name?: string
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
          created_at: string
          experience_years: number | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          phone: string | null
          plan_status: Database["public"]["Enums"]["plan_status"]
          profile_photo_url: string | null
          qualifications: string | null
          revenue_goal: number | null
          slug: string | null
          specialization: string | null
          trial_end: string
          trial_start: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          clinic_name?: string | null
          created_at?: string
          experience_years?: number | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          profile_photo_url?: string | null
          qualifications?: string | null
          revenue_goal?: number | null
          slug?: string | null
          specialization?: string | null
          trial_end?: string
          trial_start?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          clinic_name?: string | null
          created_at?: string
          experience_years?: number | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          profile_photo_url?: string | null
          qualifications?: string | null
          revenue_goal?: number | null
          slug?: string | null
          specialization?: string | null
          trial_end?: string
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
          booking_advance_days: number
          buffer_minutes: number
          created_at: string
          doctor_id: string
          google_analytics_id: string | null
          id: string
          max_per_slot: number
          online_duration: number | null
          online_fee: number | null
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
          whatsapp_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          auto_confirm?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          created_at?: string
          doctor_id: string
          google_analytics_id?: string | null
          id?: string
          max_per_slot?: number
          online_duration?: number | null
          online_fee?: number | null
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
          whatsapp_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          auto_confirm?: boolean
          booking_advance_days?: number
          buffer_minutes?: number
          created_at?: string
          doctor_id?: string
          google_analytics_id?: string | null
          id?: string
          max_per_slot?: number
          online_duration?: number | null
          online_fee?: number | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
    },
  },
} as const
