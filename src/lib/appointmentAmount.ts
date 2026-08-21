/** Initial amount for a newly created appointment, from Settings → Profile. */
export function defaultAppointmentAmount(consultationFee: number | null | undefined): number {
  if (consultationFee == null) return 0;
  const n = Number(consultationFee);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
