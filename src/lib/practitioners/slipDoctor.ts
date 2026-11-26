import type { Practitioner } from "./types";

type SlipPractitioner = Pick<
  Practitioner,
  "display_name" | "qualifications" | "specialization" | "registration_number" | "signature_url"
> & { user_id?: string | null };

type SlipProfile = {
  id?: string;
  full_name?: string | null;
  clinic_name?: string | null;
  [key: string]: unknown;
};

const filled = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/**
 * The "doctor" a prescription slip names: the clinic profile with the author practitioner's
 * own name, qualifications, specialization, registration number and signature laid over it.
 * Clinic fields (name, address, phone, email, slug) always stay the clinic's.
 *
 * No practitioner, or the owner's own practitioner row, returns the very same profile object,
 * so single-doctor clinics and the owner's slips render exactly as before (the shared slip
 * RPC get_shared_prescription skips the owner's row the same way).
 */
export function slipDoctor<P extends SlipProfile | null | undefined>(
  profile: P,
  practitioner?: SlipPractitioner | null,
): P {
  if (!profile || !practitioner) return profile;
  if (practitioner.user_id && practitioner.user_id === profile.id) return profile;

  const out: SlipProfile = { ...profile };
  // The slip and the share message print "Dr. " themselves, so a typed "Dr." is dropped.
  // Mirrored in SQL by get_shared_prescription (20261126100500_shared_rx_doctor_names.sql): keep in sync.
  const name = (practitioner.display_name ?? "").trim().replace(/^dr\.?\s+/i, "");
  if (filled(name)) out.full_name = name;
  if (filled(practitioner.qualifications)) out.qualifications = practitioner.qualifications;
  if (filled(practitioner.specialization)) out.specialization = practitioner.specialization;
  if (filled(practitioner.registration_number)) out.registration_number = practitioner.registration_number;
  if (filled(practitioner.signature_url)) out.signature_url = practitioner.signature_url;
  // The slip names a clinic without a clinic_name after full_name; keep that the owner's.
  // Mirrored in SQL by get_shared_prescription (same migration).
  if (!filled(profile.clinic_name) && filled(profile.full_name)) out.clinic_name = `Dr. ${profile.full_name} Clinic`;
  return out as P;
}
