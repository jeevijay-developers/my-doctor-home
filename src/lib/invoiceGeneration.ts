import { supabase } from "@/integrations/supabase/client";

/**
 * Generate an invoice for a completed appointment if one does not already
 * exist. Invoices are the persisted source of truth for Revenue/Billing —
 * they are created at completion time so that deleting an appointment (or
 * patient) later never reduces revenue.
 *
 * Safe to call multiple times: the invoices.appointment_id column is UNIQUE.
 */
export async function ensureInvoiceForAppointment(appointment: {
  id: string;
  doctor_id: string;
  patient_name: string;
  service_name: string;
  amount: number | string;
}) {
  // Skip if invoice already exists for this appointment.
  const existing = await (supabase.from("invoices" as any) as any)
    .select("id")
    .eq("appointment_id", appointment.id)
    .maybeSingle();
  if (existing?.data) return;

  // Load doctor's GST settings for invoice fields.
  const { data: profile } = await supabase
    .from("profiles")
    .select("gst_registered, gstin")
    .eq("id", appointment.doctor_id)
    .maybeSingle();

  const gstRegistered = Boolean((profile as any)?.gst_registered);
  const gstin = (profile as any)?.gstin || null;

  // Determine next invoice number for this doctor/year.
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data: existingInvoices } = await (supabase.from("invoices" as any) as any)
    .select("invoice_number")
    .eq("doctor_id", appointment.doctor_id)
    .like("invoice_number", `${prefix}%`);

  const nums = ((existingInvoices as any[]) || [])
    .map((r) => parseInt(String(r.invoice_number).slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const seq = (nums.length ? Math.max(...nums) : 0) + 1;
  const invoice_number = `${prefix}${String(seq).padStart(4, "0")}`;

  const amount = Number(appointment.amount) || 0;
  const gst_rate = gstRegistered ? 18 : 0;
  const gst_amount = +((amount * gst_rate) / 100).toFixed(2);
  const total_amount = +(amount + gst_amount).toFixed(2);

  await (supabase.from("invoices" as any) as any).insert({
    doctor_id: appointment.doctor_id,
    appointment_id: appointment.id,
    invoice_number,
    patient_name: appointment.patient_name,
    service_name: appointment.service_name,
    amount,
    gst_rate,
    gst_amount,
    total_amount,
    clinic_gstin: gstin,
    status: "generated",
  });
}
