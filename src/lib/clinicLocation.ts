// Single source of truth for building a clinic's Google Maps location from a
// doctor profile — shared by the Clinic Details & Contact map embed and any
// "Scan for Location" QR codes (AppointmentSlip, PaymentSlip), so they never
// disagree about where a doctor's clinic actually is.
export function getClinicMapsQuery(profile: any, fallback = ""): string {
  return (
    [profile?.clinic_name, profile?.address, profile?.city, profile?.state]
      .filter(Boolean)
      .join(", ") || fallback
  );
}

export function getClinicMapsUrl(profile: any, fallback = ""): string {
  const query = getClinicMapsQuery(profile, fallback);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}
