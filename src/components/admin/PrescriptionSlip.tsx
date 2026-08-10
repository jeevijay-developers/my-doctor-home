import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity, Download, Printer, X } from "lucide-react";

type PrescriptionSlipData = {
  id: string;
  patient_name: string;
  diagnosis: string | null;
  medications: string | null;
  date: string;
  patient_age: number | null;
  patient_weight: number | null;
  patient_gender: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  prescription: PrescriptionSlipData | null;
  onDownload: () => void;
};

const PrescriptionSlip = ({ open, onClose, profile, prescription, onDownload }: Props) => {
  if (!prescription) return null;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const clinicAddr = profile?.address || profile?.city || "";
  const clinicPhone = profile?.phone || "";

  const handlePrint = () => {
    document.body.classList.add("printing-prescription-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-prescription-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 100);
  };

  const infoFields: Array<{ label: string; value: string }> = [
    { label: "Patient Name", value: prescription.patient_name },
    { label: "Date", value: prescription.date },
    { label: "Age", value: prescription.patient_age != null ? String(prescription.patient_age) : "—" },
    { label: "Gender", value: prescription.patient_gender || "—" },
    { label: "Weight", value: prescription.patient_weight != null ? `${prescription.patient_weight} kg` : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[700px] p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 bg-white">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body.printing-prescription-slip > *:not([data-prescription-slip-print-root]) { display: none !important; }
            body.printing-prescription-slip [data-prescription-slip-print-root] { display: block !important; position: static !important; }
            [data-prescription-slip-print-hide] { display: none !important; }
            [data-prescription-slip-print-root] .slip-card { box-shadow: none !important; border: none !important; }
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
          near-invisible white-on-white whenever a doctor has dark mode on
          (confirmed: both rendered at rgb(243,245,247) on white before this
          fix). AppointmentSlip.tsx avoids the same trap the same way, with
          its own hardcoded TEAL constants instead of theme tokens.
        */}
        <div data-prescription-slip-print-root>
          <div className="slip-card bg-white overflow-hidden border border-gray-200">
            <div className="bg-royal text-white px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading font-bold text-2xl">
                  Dr. {profile?.full_name || ""}{" "}
                  {profile?.specialization && <span className="font-normal opacity-90">{profile.specialization}</span>}
                </h2>
                {profile?.qualifications && (
                  <p className="text-xs tracking-[0.2em] uppercase mt-1 opacity-90">{profile.qualifications}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/70 flex items-center justify-center flex-shrink-0">
                <Activity className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {infoFields.map((f) => (
                <div key={f.label} className="flex gap-1.5">
                  <span className="text-gray-500">{f.label}:</span>
                  <span className="font-medium text-gray-900">{f.value}</span>
                </div>
              ))}
              <div className="col-span-2 flex gap-1.5">
                <span className="text-gray-500">Diagnosis:</span>
                <span className="font-medium text-gray-900">{prescription.diagnosis || "—"}</span>
              </div>
            </div>

            <div className="px-6 py-8 min-h-[280px]">
              <div className="font-heading font-bold text-3xl text-royal mb-6">
                R<span className="align-sub text-xl">x</span>
              </div>
              <p className="text-sm text-gray-900 whitespace-pre-line leading-relaxed">
                {prescription.medications || <span className="text-gray-500 italic">No medications recorded</span>}
              </p>
            </div>

            <div className="px-6 pb-6 flex justify-end">
              <div className="text-center">
                <div className="w-40 border-t border-gray-400 pt-1">
                  <span className="text-xs text-gray-500">Signature</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 border-t border-gray-200">
              <span className="font-semibold tracking-wide uppercase text-gray-900">{clinicName}</span>
              {clinicAddr && <span>{clinicAddr}</span>}
              {clinicPhone && <span>{clinicPhone}</span>}
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
