import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Download, Printer, X } from "lucide-react";
import doctyliaLogo from "@/assets/doctylia-logo.png";
import type { MedicineItem } from "@/lib/prescriptionMedicines";

export type VisitSummary = {
  visit_date: string;
  reason_for_visit: string | null;
  symptoms: string | null;
} | null;

export type VitalsSummary = {
  blood_pressure: string | null;
  pulse: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  height: number | null;
  weight: number | null;
  bmi: number | null;
} | null;

export type PrescriptionSlipData = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  diagnosis: string | null;
  medications: string | null;
  medicines: MedicineItem[];
  advice: string | null;
  diet_advice: string | null;
  lifestyle_advice: string | null;
  follow_up_date: string | null;
  follow_up_instructions: string | null;
  date: string;
  patient_age: number | null;
  patient_weight: number | null;
  patient_gender: string | null;
  visit: VisitSummary;
  vitals: VitalsSummary;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  prescription: PrescriptionSlipData | null;
  onDownload: () => void;
};

const ROYAL = "#1d4ed8";

// A single "Label : underlined value" row, matching the reference image's
// fill-in-the-blank info box style.
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline gap-2 text-[13px]" data-prescription-slip-row>
    <span className="font-semibold text-gray-700 w-[92px] flex-shrink-0">{label}</span>
    <span className="text-gray-500">:</span>
    <span className="flex-1 border-b border-gray-300 pb-0.5 text-gray-900 font-medium truncate">{value}</span>
  </div>
);

// Large, very-low-opacity inline caduceus mark used as the background
// watermark behind the Rx/medicines section only — no external asset, so it
// always rasterizes correctly through the html2canvas PDF pipeline.
const RxWatermark = () => (
  <svg
    viewBox="0 0 200 200"
    aria-hidden
    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] opacity-[0.04]"
  >
    <line x1="100" y1="15" x2="100" y2="185" stroke={ROYAL} strokeWidth="4" />
    <circle cx="100" cy="18" r="9" fill={ROYAL} />
    <path d="M100 45 C60 60, 60 90, 100 100 C140 110, 140 140, 100 155" fill="none" stroke={ROYAL} strokeWidth="4" />
    <path d="M100 45 C140 60, 140 90, 100 100 C60 110, 60 140, 100 155" fill="none" stroke={ROYAL} strokeWidth="4" />
    <path d="M100 60 C60 40, 30 55, 20 75 C55 75, 80 68, 100 78" fill="none" stroke={ROYAL} strokeWidth="4" />
    <path d="M100 60 C140 40, 170 55, 180 75 C145 75, 120 68, 100 78" fill="none" stroke={ROYAL} strokeWidth="4" />
  </svg>
);

// Small caduceus icon for the header badge, matching the reference image's
// top-left medical-cross-with-staff icon.
const HeaderIcon = () => (
  <svg viewBox="0 0 48 48" className="w-7 h-7" aria-hidden>
    <rect x="4" y="18" width="40" height="8" rx="1.5" fill={ROYAL} />
    <rect x="20" y="2" width="8" height="40" rx="1.5" fill={ROYAL} />
  </svg>
);

const PrescriptionSlip = ({ open, onClose, profile, prescription, onDownload }: Props) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(doctorUrl, { margin: 1, width: 300, color: { dark: ROYAL, light: "#FFFFFF" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [open, doctorUrl]);

  if (!prescription) return null;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const clinicAddr = profile?.address || profile?.city || "";
  const clinicPhone = profile?.phone || "";
  const clinicEmail = profile?.clinic_email || "";
  const registrationNumber = profile?.registration_number || "";
  const signatureUrl = profile?.signature_url || "";
  const qualificationLine = [profile?.qualifications, profile?.specialization].filter(Boolean).join(" - ");

  const handlePrint = () => {
    document.body.classList.add("printing-prescription-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-prescription-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 100);
  };

  const leftInfo: Array<{ label: string; value: string }> = [
    { label: "Patient Name", value: prescription.patient_name },
    { label: "Age", value: prescription.patient_age != null ? String(prescription.patient_age) : "—" },
    { label: "Gender", value: prescription.patient_gender || "—" },
    { label: "Weight", value: prescription.patient_weight != null ? `${prescription.patient_weight} kg` : "—" },
    { label: "Diagnosis", value: prescription.diagnosis || "—" },
  ];
  if (prescription.visit?.reason_for_visit) {
    leftInfo.push({ label: "Complaint", value: prescription.visit.reason_for_visit });
  }
  if (prescription.visit?.symptoms) {
    leftInfo.push({ label: "Symptoms", value: prescription.visit.symptoms });
  }

  const rightInfo: Array<{ label: string; value: string }> = [
    { label: "Date", value: prescription.date },
    { label: "Prescription ID", value: prescription.id ? prescription.id.slice(0, 8).toUpperCase() : "PREVIEW" },
  ];
  if (prescription.patient_id) {
    rightInfo.push({ label: "Patient ID", value: prescription.patient_id.slice(0, 8).toUpperCase() });
  }
  // Patient phone is not carried on the prescription record itself today;
  // no patient-address field exists anywhere in the app yet either, so
  // neither is fabricated here — only real, available data is shown.

  const vitalsChips: Array<{ label: string; value: string }> = [];
  if (prescription.vitals) {
    const v = prescription.vitals;
    if (v.blood_pressure) vitalsChips.push({ label: "BP", value: v.blood_pressure });
    if (v.pulse != null) vitalsChips.push({ label: "Pulse", value: `${v.pulse} bpm` });
    if (v.temperature != null) vitalsChips.push({ label: "Temp", value: `${v.temperature}°F` });
    if (v.respiratory_rate != null) vitalsChips.push({ label: "RR", value: `${v.respiratory_rate}/min` });
    if (v.spo2 != null) vitalsChips.push({ label: "SpO2", value: `${v.spo2}%` });
    if (v.height != null) vitalsChips.push({ label: "Height", value: `${v.height} cm` });
    if (v.bmi != null) vitalsChips.push({ label: "BMI", value: String(v.bmi) });
  }

  const adviceSections: Array<{ label: string; value: string }> = [];
  if (prescription.advice) adviceSections.push({ label: "General Advice", value: prescription.advice });
  if (prescription.diet_advice) adviceSections.push({ label: "Diet Advice", value: prescription.diet_advice });
  if (prescription.lifestyle_advice) adviceSections.push({ label: "Lifestyle Advice", value: prescription.lifestyle_advice });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[720px] p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 bg-white">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body.printing-prescription-slip > *:not([data-prescription-slip-print-root]) { display: none !important; }
            body.printing-prescription-slip [data-prescription-slip-print-root] { display: block !important; position: static !important; }
            [data-prescription-slip-print-hide] { display: none !important; }
            [data-prescription-slip-print-root] .slip-card { box-shadow: none !important; }
            [data-prescription-slip-row] { break-inside: avoid; }
          }
        `}</style>

        {/*
          Every color inside .slip-card is a fixed neutral (gray-*) or the
          brand "royal" blue, deliberately NOT the theme-relative tokens
          (text-foreground, bg-secondary, etc.) used elsewhere in the app.
          Those tokens invert between light/dark mode — text-foreground
          resolves to a near-white color in dark mode — but this card always
          has an explicit bg-white "paper" background regardless of the
          app's active theme, so theme-relative text would become
          near-invisible white-on-white whenever a doctor has dark mode on.
          AppointmentSlip.tsx avoids the same trap the same way, with its
          own hardcoded TEAL constants instead of theme tokens.
        */}
        <div data-prescription-slip-print-root>
          <div className="slip-card bg-white p-6 sm:p-8 border border-gray-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: ROYAL }}>
                  <HeaderIcon />
                </div>
                <div>
                  <h2 className="font-heading font-bold text-2xl" style={{ color: ROYAL }}>
                    Dr. {profile?.full_name || ""}
                  </h2>
                  {qualificationLine && <p className="text-[13px] text-gray-600 mt-0.5">{qualificationLine}</p>}
                  {registrationNumber && <p className="text-[12px] text-gray-500 mt-0.5">Reg. No.: {registrationNumber}</p>}
                </div>
              </div>
              {(clinicPhone || clinicEmail) && (
                <div className="hidden sm:flex items-stretch gap-4 flex-shrink-0">
                  <div className="w-px bg-gray-200" />
                  <div className="space-y-1.5 text-[12.5px] text-gray-700">
                    {clinicPhone && (
                      <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" style={{ color: ROYAL }} /> {clinicPhone}</div>
                    )}
                    {clinicEmail && (
                      <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" style={{ color: ROYAL }} /> {clinicEmail}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="h-[2px]" style={{ backgroundColor: ROYAL }} />

            {/* Patient / Prescription info box */}
            <div className="rounded-xl border-2 mt-5 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5" style={{ borderColor: ROYAL }}>
              <div className="space-y-2.5">
                {leftInfo.map((f) => <InfoRow key={f.label} label={f.label} value={f.value} />)}
              </div>
              <div className="space-y-2.5">
                {rightInfo.map((f) => <InfoRow key={f.label} label={f.label} value={f.value} />)}
              </div>
            </div>

            {vitalsChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3" data-prescription-slip-row>
                {vitalsChips.map((c) => (
                  <span key={c.label} className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: `${ROYAL}0d`, color: ROYAL }}>
                    {c.label}: {c.value}
                  </span>
                ))}
              </div>
            )}

            {/* Rx / medicines */}
            <div className="relative mt-6 min-h-[180px]">
              <RxWatermark />
              <div className="font-heading font-extrabold text-4xl relative" style={{ color: ROYAL }}>
                R<span className="align-sub text-2xl">x</span>
              </div>
              <div className="mt-5 relative">
                {prescription.medicines.length > 0 ? (
                  <div className="space-y-4">
                    {prescription.medicines.map((m, i) => (
                      <div key={i} data-prescription-slip-row>
                        <div className="text-[14px] font-semibold text-gray-900">
                          {i + 1}. {m.name}{m.strength ? ` — ${m.strength}` : ""}
                        </div>
                        {(m.frequency || m.duration || m.timing || m.route) && (
                          <div className="text-[12px] text-gray-600 pl-4 mt-0.5">
                            {[
                              m.frequency && `Dosage: ${m.frequency}`,
                              m.duration && `Duration: ${m.duration}`,
                              m.timing && `Timing: ${m.timing}`,
                              m.route && `Route: ${m.route}`,
                            ].filter(Boolean).join("  ·  ")}
                          </div>
                        )}
                        {m.instructions && <div className="text-[12px] text-gray-500 italic pl-4 mt-0.5">{m.instructions}</div>}
                      </div>
                    ))}
                  </div>
                ) : prescription.medications ? (
                  <p className="text-[14px] text-gray-900 whitespace-pre-line leading-relaxed">{prescription.medications}</p>
                ) : (
                  <p className="text-[14px] text-gray-400 italic">No medications recorded</p>
                )}
              </div>
            </div>

            {(adviceSections.length > 0 || prescription.follow_up_date || prescription.follow_up_instructions) && (
              <div className="mt-6 space-y-2.5 border-t border-gray-200 pt-4">
                {adviceSections.map((s) => (
                  <div key={s.label} data-prescription-slip-row>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
                    <p className="text-[13px] text-gray-900 whitespace-pre-line mt-0.5">{s.value}</p>
                  </div>
                ))}
                {(prescription.follow_up_date || prescription.follow_up_instructions) && (
                  <div data-prescription-slip-row>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Follow-up</p>
                    <p className="text-[13px] text-gray-900 mt-0.5">
                      {prescription.follow_up_date && <span className="font-medium">{prescription.follow_up_date}</span>}
                      {prescription.follow_up_date && prescription.follow_up_instructions && " — "}
                      {prescription.follow_up_instructions}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Signature */}
            <div className="flex justify-end mt-10" data-prescription-slip-row>
              <div className="text-center">
                {signatureUrl && <img src={signatureUrl} alt="Signature" className="h-14 object-contain mx-auto mb-1" />}
                <div className="w-48 border-t border-gray-400 pt-1">
                  <p className="text-[11px] text-gray-500">Signature</p>
                  <p className="text-[12px] font-semibold text-gray-900 mt-1">Dr. {profile?.full_name || ""}</p>
                  {qualificationLine && <p className="text-[10.5px] text-gray-500">{qualificationLine}</p>}
                  {registrationNumber && <p className="text-[10.5px] text-gray-500">Reg. No.: {registrationNumber}</p>}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="rounded-xl border-2 mt-6 grid grid-cols-1 sm:grid-cols-2" style={{ borderColor: ROYAL }}>
              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-[13px] font-bold" style={{ color: ROYAL }}>Clinic Address</p>
                <p className="text-[13px] font-bold text-gray-900">{clinicName}</p>
                {clinicAddr && <p className="text-[12.5px] text-gray-600 whitespace-pre-line">{clinicAddr}</p>}
                {clinicPhone && <p className="text-[12.5px] text-gray-600">{clinicPhone}</p>}
                {clinicEmail && <p className="text-[12.5px] text-gray-600">{clinicEmail}</p>}
              </div>
              <div className="p-4 sm:p-5 border-t sm:border-t-0 sm:border-l flex flex-col items-center justify-center gap-2" style={{ borderColor: `${ROYAL}33` }}>
                <p className="text-[13px] font-bold text-center" style={{ color: ROYAL }}>Scan to visit our website</p>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Scan to visit website" className="w-[92px] h-[92px]" />
                ) : (
                  <div className="w-[92px] h-[92px] bg-gray-100 rounded animate-pulse" />
                )}
                <img src={doctyliaLogo} alt="Doctylia" className="h-4 w-auto object-contain opacity-60" />
              </div>
            </div>
          </div>

          <div data-prescription-slip-print-hide className="flex flex-wrap gap-2 justify-end p-4 border-t bg-secondary/40">
            <Button variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={onDownload} className="gap-1.5">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button onClick={onClose} className="gap-1.5 bg-royal hover:bg-royal/90 text-white">
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionSlip;
