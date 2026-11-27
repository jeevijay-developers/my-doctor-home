// Which doctor (practitioner) a paid public booking is for. Shared by create-razorpay-order
// (and anything else that books on a patient's behalf). Pure rule + one DB read; no Node imports,
// so it runs on Deno and is unit-tested by Vitest.

export interface PractitionerRow {
  id: string; is_primary: boolean; online_booking: boolean; consultation_fee: number | null;
  sort_order: number; created_at: string;
}
export type PractitionerPick =
  | { ok: true; id: string; fee: number | null }
  | { ok: false; error: "PRACTITIONER_REQUIRED" | "PRACTITIONER_NOT_BOOKABLE" | "PRACTITIONER_LOOKUP_FAILED"; status: number };

/** Pure rule shared by the order and verify functions. `rows` = the clinic's active, bookable
 *  practitioners ordered is_primary DESC, sort_order, created_at, id; `seatLimit` from
 *  clinic_doctor_seat_limit(). Mirrors fill_practitioner('booking') + practitioner_within_seats. */
export function pickBookingPractitioner(rows: PractitionerRow[], seatLimit: number, requested?: string | null): PractitionerPick {
  const within = rows.slice(0, Math.max(1, seatLimit));
  // With no doctor requested, only doctors who take online bookings are candidates, so a clinic
  // where just one of two active doctors is online-bookable resolves to that one.
  const online = within.filter((r) => r.online_booking);
  if (!requested && within.length > 0 && online.length === 0) {
    return { ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409 };
  }
  const pick = requested ? within.find((r) => r.id === requested) : online.length === 1 ? online[0] : undefined;
  if (!pick) return { ok: false, error: requested ? "PRACTITIONER_NOT_BOOKABLE" : "PRACTITIONER_REQUIRED", status: 409 };
  if (!pick.online_booking) return { ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409 };
  const fee = pick.consultation_fee != null && Number(pick.consultation_fee) > 0 ? Number(pick.consultation_fee) : null;
  return { ok: true, id: pick.id, fee };
}

// deno-lint-ignore no-explicit-any
export async function resolveBookingPractitioner(admin: any, doctorId: string, requested?: string | null): Promise<PractitionerPick> {
  const [{ data: rows, error }, { data: limit, error: limitErr }] = await Promise.all([
    admin.from("practitioners")
      .select("id, is_primary, online_booking, consultation_fee, sort_order, created_at")
      .eq("doctor_id", doctorId).eq("is_active", true).eq("is_bookable", true)
      .order("is_primary", { ascending: false }).order("sort_order").order("created_at").order("id"),
    admin.rpc("clinic_doctor_seat_limit", { _doctor_id: doctorId }),
  ]);
  if (error || limitErr) return { ok: false, error: "PRACTITIONER_LOOKUP_FAILED", status: 500 };
  return pickBookingPractitioner(rows ?? [], typeof limit === "number" ? limit : 1, requested ?? null);
}

/** Edge functions run as the service role, so the DB guard that makes doctor-role staff rows
 *  owner-only does not apply to them. Only the clinic owner may touch a doctor-role or
 *  practitioner-linked staff_members row; ordinary staff may only touch plain staff rows. */
export function staffMayEditStaffRow(
  callerIsOwner: boolean,
  target: { role?: string | null; practitioner_id?: string | null },
): boolean {
  if (callerIsOwner) return true;
  return target.role !== "doctor" && !target.practitioner_id;
}

/** @deprecated create-staff-account now calls the `phone_owns_clinic` RPC; kept (with its tests) for now.
 *  True when `phoneDigits` is the phone of a clinic owner (a `profiles` row). Matches on the last
 *  10 digits, whatever format the profile stored, so a number already running its own clinic can
 *  not also become a staff or doctor login in another clinic (it would lose its own clinic on
 *  sign-in). The caller pre-filters `profileRows` with `.like("phone", "%" + last10)`. */
export function phoneOwnsClinic(phoneDigits: string, profileRows: { phone: string | null }[]): boolean {
  const last10 = String(phoneDigits ?? "").replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return false;
  return profileRows.some((r) => {
    const digits = String(r.phone ?? "").replace(/\D/g, "");
    return digits.length >= 10 && digits.slice(-10) === last10;
  });
}

/** `rows` = the service's `service_practitioners` rows. No rows = offered by every doctor;
 *  otherwise only the mapped doctors offer it. Used by create-razorpay-order only (never by
 *  verify-razorpay-payment: a paid booking is never refused after payment). */
export function serviceOfferedBy(rows: { practitioner_id: string }[] | null | undefined, practitionerId: string): boolean {
  if (!rows || rows.length === 0) return true;
  return rows.some((r) => r.practitioner_id === practitionerId);
}
