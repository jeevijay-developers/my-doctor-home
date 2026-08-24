export type AppointmentType = "clinic" | "online";

export const effectiveAppointmentCapacity = (
  appointmentType: AppointmentType,
  clinicCapacity: number | null | undefined,
) => {
  if (appointmentType === "online") return 1;
  return typeof clinicCapacity === "number" && clinicCapacity > 0
    ? Math.floor(clinicCapacity)
    : 1;
};