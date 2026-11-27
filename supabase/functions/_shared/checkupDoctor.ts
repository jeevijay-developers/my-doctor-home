// Which doctor a checkup reminder names. Reminders belong to the clinic (doctor_id = owner), so in a
// multi-doctor clinic "your checkup with Dr. <owner>" would be wrong for a patient treated by the
// second doctor. We name the doctor of the patient's most recent visit; any gap (single-doctor
// clinic, no visit, the owner's own row, an unnamed doctor) falls back to the owner's profile name,
// exactly as before. No Node imports: runs on Deno and is unit-tested by Vitest.

export interface LastVisitDoctor { display_name: string | null; user_id: string | null }

/** The templates print "Dr. " themselves, so a typed "Dr."/"Dr " is dropped (never "Drake"). */
export function stripDrPrefix(name: string): string {
  return name.trim().replace(/^dr\.?\s+/i, "");
}

export function reminderDoctorName(
  ownerName: string | null | undefined,
  ownerId: string,
  activeDoctorCount: number,
  lastVisitDoctor: LastVisitDoctor | null | undefined,
): string | null {
  const fallback = ownerName || null;
  if (activeDoctorCount < 2 || !lastVisitDoctor) return fallback;
  if (lastVisitDoctor.user_id && lastVisitDoctor.user_id === ownerId) return fallback;
  const n = stripDrPrefix(lastVisitDoctor.display_name ?? "");
  return n !== "" ? n : fallback;
}

// deno-lint-ignore no-explicit-any
export async function resolveReminderDoctorName(admin: any, ownerId: string, patientId: string, ownerName: string | null | undefined): Promise<string | null> {
  try {
    const { count } = await admin.from("practitioners").select("id", { count: "exact", head: true })
      .eq("doctor_id", ownerId).eq("is_active", true);
    if ((count ?? 0) < 2) return ownerName || null;
    const { data: visit } = await admin.from("patient_visits")
      .select("practitioner:practitioners(display_name, user_id)")
      .eq("doctor_id", ownerId).eq("patient_id", patientId)
      .order("visit_date", { ascending: false }).order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    return reminderDoctorName(ownerName, ownerId, count ?? 0, (visit?.practitioner as LastVisitDoctor | null) ?? null);
  } catch (_e) {
    return ownerName || null;
  }
}
