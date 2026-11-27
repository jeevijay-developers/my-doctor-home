import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Download, Printer, X } from "lucide-react";
import doctyliaLogo from "@/assets/doctylia-logo.webp";
import type { MedicineItem } from "@/lib/prescriptionMedicines";
import { parseTemplateConfig } from "@/lib/prescriptionTemplate/config";
import { formatExtraValue, isEmptyValue, parseExtra } from "@/lib/prescriptionTemplate/extra";
import { parseToothMap } from "@/lib/prescriptionTemplate/teeth";
import {
  RIGHT_INFO_FIELDS,
  type Block, type CustomBlock, type CustomFieldType, type InfoFieldKey, type TemplateConfig,
} from "@/lib/prescriptionTemplate/types";
import ToothChartView from "./prescription-slip/ToothChartView";
import PainScaleView from "./prescription-slip/PainScaleView";

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
  /** The prescription's author doctor; the caller passes `slipDoctor(profile, byId(practitioner_id))` as `profile`. */
  practitioner_id?: string | null;
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
  /** Answers to the template's custom fields, keyed by block id. */
  extra?: Record<string, unknown> | null;
  /** The template this prescription was issued with; absent = the built-in standard slip. */
  template_snapshot?: unknown;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  prescription: PrescriptionSlipData | null;
  onDownload: () => void;
  /** Optional extra action (e.g. the Share button) shown beside Print / Download. */
  shareSlot?: ReactNode;
  /** Hides `shareSlot` for callers where sharing already lives elsewhere (e.g. the Prescriptions page's own side panel). */
  hideShare?: boolean;
};

// A single "Label : value" row. Wraps rather than clipping long values (a
// long diagnosis, patient name, etc.) — `min-w-0` is required for a flex
// child to actually shrink/wrap instead of overflowing its row.
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start gap-2 text-[13px]" data-prescription-slip-row>
    <span className="font-semibold text-gray-700 w-[92px] flex-shrink-0">{label}</span>
    <span className="text-gray-500">:</span>
    <span className="flex-1 min-w-0 text-gray-900 font-medium break-words">{value}</span>
  </div>
);

// Large, very-low-opacity inline caduceus mark used as the background
// watermark behind the Rx/medicines section only — no external asset, so it
// always rasterizes correctly through the html2canvas PDF pipeline.
const RxWatermark = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 200 200"
    aria-hidden
    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] opacity-[0.04]"
  >
    <line x1="100" y1="15" x2="100" y2="185" stroke={color} strokeWidth="4" />
    <circle cx="100" cy="18" r="9" fill={color} />
    <path d="M100 45 C60 60, 60 90, 100 100 C140 110, 140 140, 100 155" fill="none" stroke={color} strokeWidth="4" />
    <path d="M100 45 C140 60, 140 90, 100 100 C60 110, 60 140, 100 155" fill="none" stroke={color} strokeWidth="4" />
    <path d="M100 60 C60 40, 30 55, 20 75 C55 75, 80 68, 100 78" fill="none" stroke={color} strokeWidth="4" />
    <path d="M100 60 C140 40, 170 55, 180 75 C145 75, 120 68, 100 78" fill="none" stroke={color} strokeWidth="4" />
  </svg>
);

// Small caduceus icon for the header badge, matching the reference image's
// top-left medical-cross-with-staff icon.
const HeaderIcon = ({ color }: { color: string }) => (
  <svg viewBox="0 0 48 48" className="w-7 h-7" aria-hidden>
    <rect x="4" y="18" width="40" height="8" rx="1.5" fill={color} />
    <rect x="20" y="2" width="8" height="40" rx="1.5" fill={color} />
  </svg>
);

const SHORT_FIELD_TYPES: CustomFieldType[] = ["text", "number", "select", "checkbox", "date"];

// One custom field of the template. Unanswered fields print nothing.
const CustomBlockView = ({ block, value, accent }: { block: CustomBlock; value: unknown; accent: string }) => {
  if (isEmptyValue(value)) return null;
  if (SHORT_FIELD_TYPES.includes(block.fieldType)) {
    return (
      <div className="flex items-baseline gap-2 text-[13px] mt-2.5" data-prescription-slip-row>
        <span className="font-semibold text-gray-700 flex-shrink-0 max-w-[50%] break-words">{block.label} :</span>
        <span className="flex-1 min-w-0 text-gray-900 font-medium break-words">{formatExtraValue(block, value)}</span>
      </div>
    );
  }
  return (
    <div className="mt-4" data-prescription-slip-row>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{block.label}</p>
      <div className="mt-1">
        {block.fieldType === "tooth_chart" ? (
          <ToothChartView value={parseToothMap(value)} accent={accent} />
        ) : block.fieldType === "pain_scale" ? (
          <PainScaleView value={Number(value)} accent={accent} />
        ) : (
          <p className="text-[13px] text-gray-900 whitespace-pre-line break-words">{formatExtraValue(block, value)}</p>
        )}
      </div>
    </div>
  );
};

type CardProps = {
  profile: any;
  prescription: PrescriptionSlipData;
  /** Overrides the prescription's own snapshot (the builder's live preview). */
  template?: TemplateConfig;
  /**
   * Prints the clinic's own header and footer even if the layout is for pre-printed stationery.
   * For readers who have no stationery to print on (the patient's /rx page).
   */
  forceLetterhead?: boolean;
};

type InfoRowData = { label: string; value: string };

// Printable width of an A4 page in the PDF (21 cm minus 2 x 24 pt margins). The PDF is scaled by the
// slip's width, so the pre-printed spacers are sized as a fraction of it, not in absolute units.
const A4_CONTENT_MM = 193;

export const PrescriptionSlipCard = ({ profile, prescription, template, forceLetterhead }: CardProps) => {
  // template prop > the layout the prescription was issued with > the built-in standard slip.
  const config = useMemo(
    () => template ?? parseTemplateConfig(prescription.template_snapshot),
    [template, prescription.template_snapshot],
  );
  const extra = useMemo(() => parseExtra(prescription.extra), [prescription.extra]);
  const accent = config.accent;

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;
  const preprinted = config.letterhead === "preprinted" && !forceLetterhead;
  const showQr = config.footer.qr && !preprinted;

  useEffect(() => {
    if (!showQr) return;
    let cancelled = false;
    QRCode.toDataURL(doctorUrl, { margin: 1, width: 300, color: { dark: accent, light: "#FFFFFF" } })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [doctorUrl, accent, showQr]);

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const clinicAddr = profile?.address || profile?.city || "";
  const clinicPhone = profile?.phone || "";
  const clinicEmail = profile?.clinic_email || "";
  const registrationNumber = profile?.registration_number || "";
  const signatureUrl = profile?.signature_url || "";
  const qualificationLine = [profile?.qualifications, profile?.specialization].filter(Boolean).join(" - ");

  // Patient / prescription info box. Rows that depend on the visit or a linked patient only print
  // when there is something to show; the rest always print, with a dash for a missing value.
  // Patient phone is not carried on the prescription record itself and no patient-address field
  // exists anywhere in the app yet, so neither is fabricated here.
  const infoRow = (key: InfoFieldKey): InfoRowData | null => {
    switch (key) {
      case "patient_name": return { label: "Patient Name", value: prescription.patient_name };
      case "age": return { label: "Age", value: prescription.patient_age != null ? String(prescription.patient_age) : "—" };
      case "gender": return { label: "Gender", value: prescription.patient_gender || "—" };
      case "weight": return { label: "Weight", value: prescription.patient_weight != null ? `${prescription.patient_weight} kg` : "—" };
      case "diagnosis": return { label: "Diagnosis", value: prescription.diagnosis || "—" };
      case "complaint": return prescription.visit?.reason_for_visit ? { label: "Complaint", value: prescription.visit.reason_for_visit } : null;
      case "symptoms": return prescription.visit?.symptoms ? { label: "Symptoms", value: prescription.visit.symptoms } : null;
      case "date": return { label: "Date", value: prescription.date };
      case "rx_id": return { label: "Prescription ID", value: prescription.id ? prescription.id.slice(0, 8).toUpperCase() : "PREVIEW" };
      case "patient_id": return prescription.patient_id ? { label: "Patient ID", value: prescription.patient_id.slice(0, 8).toUpperCase() } : null;
    }
  };
  const present = (r: InfoRowData | null): r is InfoRowData => r !== null;

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
  const hasFollowUp = !!(prescription.follow_up_date || prescription.follow_up_instructions);

  const renderBlock = (block: Block, index: number, blocks: Block[]) => {
    switch (block.type) {
      case "patient_info": {
        const rightKeys = new Set<InfoFieldKey>(RIGHT_INFO_FIELDS);
        const left = block.fields.filter((k) => !rightKeys.has(k)).map(infoRow).filter(present);
        const right = block.fields.filter((k) => rightKeys.has(k)).map(infoRow).filter(present);
        if (left.length + right.length === 0) return null;
        return (
          <div key={block.id} className="rounded-xl border-2 mt-5 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5" style={{ borderColor: accent }}>
            <div className="space-y-2.5">
              {left.map((f) => <InfoRow key={f.label} label={f.label} value={f.value} />)}
            </div>
            <div className="space-y-2.5">
              {right.map((f) => <InfoRow key={f.label} label={f.label} value={f.value} />)}
            </div>
          </div>
        );
      }
      case "vitals":
        if (vitalsChips.length === 0) return null;
        return (
          <div key={block.id} className="flex flex-wrap gap-2 mt-3" data-prescription-slip-row>
            {vitalsChips.map((c) => (
              <span key={c.label} className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: `${accent}0d`, color: accent }}>
                {c.label}: {c.value}
              </span>
            ))}
          </div>
        );
      case "medicines":
        return (
          <div key={block.id} className="relative mt-6 min-h-[180px]">
            <RxWatermark color={accent} />
            <div className="relative">
              {(prescription.medicines?.length ?? 0) > 0 ? (
                <div className="space-y-4">
                  {prescription.medicines.map((m, i) => {
                    // Readable words, never the raw 0/1 timing code, for
                    // the patient-facing invoice.
                    const timingLabel = [
                      m.morning === 1 && "Morning",
                      m.afternoon === 1 && "Afternoon",
                      m.evening === 1 && "Evening/Night",
                    ].filter(Boolean).join(", ");
                    return (
                      <div key={i} data-prescription-slip-row>
                        <div className="text-[14px] font-semibold text-gray-900">
                          {i + 1}. {m.name}{m.strength ? ` — ${m.strength}` : ""}
                        </div>
                        <div className="text-[12px] text-gray-600 pl-4 mt-0.5 break-words">
                          {[
                            timingLabel,
                            m.durationDays > 0 && `${m.durationDays} day${m.durationDays === 1 ? "" : "s"}`,
                            m.food === "before" ? "Before Food" : "After Food",
                          ].filter(Boolean).join("  ·  ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : prescription.medications ? (
                <p className="text-[14px] text-gray-900 whitespace-pre-line leading-relaxed">{prescription.medications}</p>
              ) : (
                <p className="text-[14px] text-gray-400 italic">No medications recorded</p>
              )}
            </div>
          </div>
        );
      case "advice":
        if (adviceSections.length === 0) return null;
        return (
          <div key={block.id} className="mt-6 space-y-2.5 border-t border-gray-200 pt-4">
            {adviceSections.map((s) => (
              <div key={s.label} data-prescription-slip-row>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
                <p className="text-[13px] text-gray-900 whitespace-pre-line mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        );
      case "follow_up": {
        if (!hasFollowUp) return null;
        // Directly under printed advice it continues the same section; otherwise it opens its own.
        const prev = blocks[index - 1];
        const joinsAdvice = !!prev && prev.type === "advice" && adviceSections.length > 0;
        return (
          <div key={block.id} className={joinsAdvice ? "mt-2.5" : "mt-6 border-t border-gray-200 pt-4"} data-prescription-slip-row>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Follow-up</p>
            <p className="text-[13px] text-gray-900 mt-0.5">
              {prescription.follow_up_date && <span className="font-medium">{prescription.follow_up_date}</span>}
              {prescription.follow_up_date && prescription.follow_up_instructions && " — "}
              {prescription.follow_up_instructions}
            </p>
          </div>
        );
      }
      case "signature":
        return (
          <div key={block.id} className="flex justify-end mt-10" data-prescription-slip-row>
            <div className="text-center">
              {signatureUrl && <img src={signatureUrl} alt="Signature" className="h-14 object-contain mx-auto mb-1" />}
              <div className="w-48 border-t border-gray-400 pt-1">
                <p className="text-[11px] text-gray-500">Signature</p>
                <p className="text-[12px] font-semibold text-gray-900 mt-1">Dr. {profile?.full_name || ""}</p>
                {config.header.qualifications && qualificationLine && <p className="text-[10.5px] text-gray-500">{qualificationLine}</p>}
                {config.header.registration && registrationNumber && <p className="text-[10.5px] text-gray-500">Reg. No.: {registrationNumber}</p>}
              </div>
            </div>
          </div>
        );
      case "custom":
        return <CustomBlockView key={block.id} block={block} value={extra[block.id]} accent={accent} />;
    }
  };

  // Blocks are rendered in the template's order; switched-off ones are skipped.
  const enabledBlocks = config.blocks.filter((b) => b.enabled);
  const hasFooter = preprinted ? config.preprintedBottomMm > 0 : config.footer.address || config.footer.qr;

  return (
    <div className="slip-card bg-white border border-gray-200">
      {preprinted ? (
        // The clinic's own stationery supplies the letterhead: leave that space blank.
        config.preprintedTopMm > 0 && (
          <div data-prescription-slip-header aria-hidden style={{ width: "100%", aspectRatio: `${A4_CONTENT_MM} / ${config.preprintedTopMm}` }} />
        )
      ) : (
        <div data-prescription-slip-header className="px-6 sm:px-8 pt-6 sm:pt-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: accent }}>
                <HeaderIcon color={accent} />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading font-bold text-2xl break-words" style={{ color: accent }}>
                  Dr. {profile?.full_name || ""}
                </h2>
                {config.header.qualifications && qualificationLine && <p className="text-[13px] text-gray-600 mt-0.5 break-words">{qualificationLine}</p>}
                {config.header.registration && registrationNumber && <p className="text-[12px] text-gray-500 mt-0.5 break-words">Reg. No.: {registrationNumber}</p>}
              </div>
            </div>
            {config.header.contact && (clinicPhone || clinicEmail) && (
              <div className="hidden sm:flex items-stretch gap-4 flex-shrink-0 max-w-[45%]">
                <div className="w-px bg-gray-200" />
                <div className="space-y-1.5 text-[12.5px] text-gray-700 min-w-0">
                  {clinicPhone && (
                    <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} /> <span className="break-words">{clinicPhone}</span></div>
                  )}
                  {clinicEmail && (
                    <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} /> <span className="break-all">{clinicEmail}</span></div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="h-[2px]" style={{ backgroundColor: accent }} />
          {config.title && (
            <p className="text-center text-[13px] font-bold tracking-[0.2em] uppercase mt-3 break-words" style={{ color: accent }}>{config.title}</p>
          )}
        </div>
      )}

      <div data-prescription-slip-body className={`px-6 sm:px-8 ${hasFooter ? "" : "pb-6 sm:pb-8"}`}>
        {preprinted && config.title && (
          <p className="text-center text-[13px] font-bold tracking-[0.2em] uppercase pt-3 break-words" style={{ color: accent }}>{config.title}</p>
        )}
        {enabledBlocks.map((b, i) => renderBlock(b, i, enabledBlocks))}
      </div>

      {preprinted ? (
        config.preprintedBottomMm > 0 && (
          <div data-prescription-slip-footer aria-hidden style={{ width: "100%", aspectRatio: `${A4_CONTENT_MM} / ${config.preprintedBottomMm}` }} />
        )
      ) : (
        (config.footer.address || config.footer.qr) && (
          <div data-prescription-slip-footer className="px-6 sm:px-8 pb-6 sm:pb-8">
            {/* Footer */}
            <div
              className={`rounded-xl border-2 mt-6 grid grid-cols-1 ${config.footer.address && config.footer.qr ? "sm:grid-cols-2" : ""}`}
              style={{ borderColor: accent }}
            >
              {config.footer.address && (
                <div className="p-4 sm:p-5 space-y-1">
                  <p className="text-[13px] font-bold" style={{ color: accent }}>Clinic Address</p>
                  <p className="text-[13px] font-bold text-gray-900">{clinicName}</p>
                  {clinicAddr && <p className="text-[12.5px] text-gray-600 whitespace-pre-line">{clinicAddr}</p>}
                  {!config.footer.qr && <img src={doctyliaLogo} alt="Doctylia" className="h-4 w-auto object-contain opacity-60 pt-1" />}
                </div>
              )}
              {config.footer.qr && (
                <div
                  className={`p-4 sm:p-5 flex flex-col items-center justify-center gap-2 ${config.footer.address ? "border-t sm:border-t-0 sm:border-l" : ""}`}
                  style={{ borderColor: `${accent}33` }}
                >
                  <p className="text-[13px] font-bold text-center" style={{ color: accent }}>Scan to visit our website</p>
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Scan to visit website" className="w-[92px] h-[92px]" />
                  ) : (
                    <div className="w-[92px] h-[92px] bg-gray-100 rounded animate-pulse" />
                  )}
                  <img src={doctyliaLogo} alt="Doctylia" className="h-4 w-auto object-contain opacity-60" />
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};

const PrescriptionSlip = ({ open, onClose, profile, prescription, onDownload, shareSlot, hideShare }: Props) => {
  if (!prescription) return null;

  const handlePrint = () => {
    document.body.classList.add("printing-prescription-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-prescription-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 100);
  };

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
          template's accent colour, deliberately NOT the theme-relative tokens
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
          {/*
            Split into header/body/footer so the "Download PDF" pipeline
            (downloadPdfFromNode) can rasterize each independently: the
            header is placed only on page 1, the footer is pinned to the
            fixed bottom of every page, and the body is paginated to fill
            whatever space is left on each page — see downloadSlip() in
            PrescriptionsPage.tsx for the selectors passed in.
          */}
          <PrescriptionSlipCard profile={profile} prescription={prescription} />


          <div data-prescription-slip-print-hide className="flex flex-wrap gap-2 justify-end p-4 border-t bg-secondary/40">
            {!hideShare && shareSlot}
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
