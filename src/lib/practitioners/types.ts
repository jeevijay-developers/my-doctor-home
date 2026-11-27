import type { Database, Tables } from "@/integrations/supabase/types";

export type Practitioner = Tables<"practitioners">;

// Hand-written rather than derived: the generated RPC return types drop nullability
// (every column comes back as non-null) and get_clinic_doctor_access returns plain Json.
// The key checks below keep PublicPractitioner in step with the generated shape.
export interface PublicPractitioner {
  id: string; display_name: string; slug: string; specialization: string | null; qualifications: string | null;
  experience_years: number | null; bio: string | null; photo_url: string | null; registration_number: string | null;
  consultation_fee: number | null; slot_duration_minutes: number | null; online_booking: boolean; bookable: boolean;
  is_primary: boolean; is_owner: boolean; sort_order: number;
  /** Listed in the directory. */
  directory_listed: boolean;
  /** Visible reviews written for this doctor (reviews for the clinic as a whole are not counted). */
  review_count: number; avg_rating: number | null;
}

/** Shape of the jsonb returned by get_clinic_doctor_access(_doctor_id). */
export interface ClinicDoctorAccess {
  enabled: boolean; has_feature: boolean; seat_limit: number | null; seats_used: number;
  extra_seats: number; seat_max: number; seat_price: number | null;
  /** Seats bought and valid right now (on top of the ones superadmin granted). */
  purchased_seats?: number;
  /** When the soonest-ending purchased seats stop, or null. */
  seats_valid_until?: string | null;
  /** Price is set and the plan is an active Premium plan with time left. */
  can_buy_seats?: boolean;
}

type GeneratedPublicPractitioner = Database["public"]["Functions"]["get_public_practitioners"]["Returns"][number];
type AssertNever<T extends never> = T;
// Fails to compile if the RPC gains or loses a column without this interface following.
export type _PublicPractitionerKeysMatch = [
  AssertNever<Exclude<keyof GeneratedPublicPractitioner, keyof PublicPractitioner>>,
  AssertNever<Exclude<keyof PublicPractitioner, keyof GeneratedPublicPractitioner>>,
];
