import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Stethoscope, Building2, Calendar, Clock, User, Phone,
  IndianRupee, BadgeCheck, MapPin, Mail, Globe, Receipt, Download, Printer, X, Hash,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import doctyliaLogo from "@/assets/doctylia-logo.png";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  token: string;
  service: { name: string; price: number } | null;
  type: "clinic" | "online";
  date: Date | null;
  time: string;
  patientName: string;
  patientPhone: string;
  amount: number;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  paidAt: string | null;
  onDownload: () => void;
};

const TEAL_DARK = "#0a4e58";
const TEAL = "#0f6e7c";

// Separate, standalone receipt for the online payment itself — distinct from
// AppointmentSlip (the booking confirmation). Never shows the doctor's photo,
// only the Doctylia logo + clinic contact block, matching AppointmentSlip.
const PaymentSlip = ({
  open, onClose, profile, token, service, type, date, time,
  patientName, patientPhone, amount, razorpayPaymentId, razorpayOrderId, paidAt, onDownload,
}: Props) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const clinicAddr = profile?.clinic_address || profile?.address || profile?.city || "";
  const clinicPhone = profile?.clinic_phone || profile?.phone || "";
  const clinicEmail = profile?.clinic_email || profile?.email || "";
  const websiteLabel = doctorUrl.replace(/^https?:\/\//, "");

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(doctorUrl, {
      margin: 1, width: 400, color: { dark: TEAL_DARK, light: "#FFFFFF" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [open, doctorUrl]);

  const handlePrint = () => {
    document.body.classList.add("printing-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 100);
  };

  const rows: Array<{ icon: any; label: string; value: string }> = [
    { icon: Stethoscope, label: "Doctor", value: `Dr. ${profile?.full_name || ""}` },
    { icon: Building2, label: "Clinic", value: clinicName },
    { icon: User, label: "Patient", value: patientName },
    { icon: Phone, label: "Phone", value: patientPhone },
    { icon: Stethoscope, label: "Service", value: service?.name || "" },
    { icon: Calendar, label: "Appointment", value: date ? `${format(date, "d MMM yyyy")}${time ? `, ${time}` : ""}` : "" },
    { icon: Hash, label: "Payment ID", value: razorpayPaymentId || "—" },
    { icon: Hash, label: "Order ID", value: razorpayOrderId || "—" },
    { icon: Clock, label: "Paid On", value: paidAt ? format(new Date(paidAt), "d MMM yyyy, h:mm a") : "" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[720px] p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 bg-white">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body.printing-slip > *:not([data-payment-slip-print-root]) { display: none !important; }
            body.printing-slip [data-payment-slip-print-root] { display: block !important; position: static !important; }
            [data-payment-slip-print-hide] { display: none !important; }
            [data-payment-slip-print-root] .slip-card { box-shadow: none !important; border: none !important; }
          }
        `}</style>

        <div data-payment-slip-print-root>
          <div className="slip-card relative bg-white overflow-hidden" style={{ aspectRatio: "1 / 1.45" }}>
            <div
              className="absolute inset-y-0 left-0 pointer-events-none"
              style={{ width: "36%", background: "linear-gradient(135deg, #1c8998 0%, #0a4f5a 100%)" }}
              aria-hidden
            />

            <div className="relative grid grid-cols-[36%_64%] h-full">
              {/* LEFT COLUMN — logo + clinic contact only, no photo */}
              <div className="flex flex-col text-white p-4 md:p-5">
                <div className="flex items-center justify-center gap-2 pt-1">
                  <img src={doctyliaLogo} alt="Doctylia" className="h-9 w-auto object-contain shrink-0" />
                </div>
                <div className="mt-auto space-y-2 text-[9.5px] text-white/95 pb-2">
                  {clinicAddr && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="leading-snug break-words">{clinicAddr}</span>
                    </div>
                  )}
                  {clinicPhone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="break-all">{clinicPhone}</span>
                    </div>
                  )}
                  {clinicEmail && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="break-all">{clinicEmail}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <Globe className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="break-all leading-snug">{websiteLabel}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="flex flex-col p-5 md:p-6 pl-5 md:pl-7">
                <div className="flex flex-col items-center">
                  <div
                    className="w-12 h-12 rounded-full border-[2.5px] flex items-center justify-center mb-2"
                    style={{ borderColor: TEAL, color: TEAL_DARK }}
                  >
                    <Receipt className="h-6 w-6" />
                  </div>
                  <h2
                    className="font-heading font-extrabold text-2xl md:text-[26px] tracking-wider text-center"
                    style={{ color: TEAL_DARK }}
                  >
                    PAYMENT RECEIPT
                  </h2>
                  <svg width="180" height="16" viewBox="0 0 180 16" className="mt-1.5 mb-4" aria-hidden>
                    <path
                      d="M0 8 L60 8 L68 8 L74 2 L82 14 L90 5 L98 11 L106 8 L180 8"
                      fill="none" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>

                  <div
                    className="border-[2px] rounded-xl px-8 py-2.5 text-center mb-5 min-w-[200px]"
                    style={{ borderColor: TEAL }}
                  >
                    <div className="text-[10.5px] tracking-[0.3em] font-semibold" style={{ color: TEAL }}>AMOUNT PAID</div>
                    <div className="font-heading font-extrabold text-[30px] leading-none mt-0.5 flex items-center justify-center gap-0.5" style={{ color: TEAL_DARK }}>
                      <IndianRupee className="h-6 w-6" />{amount}
                    </div>
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: `${TEAL}22` }}>
                  {rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[22px_1fr_1.4fr] items-center gap-2 py-2">
                      <r.icon className="h-4 w-4" style={{ color: TEAL_DARK }} />
                      <div className="text-[12px]" style={{ color: "#6b7280" }}>{r.label}</div>
                      <div className="text-[12px] font-bold break-words" style={{ color: TEAL_DARK }}>
                        {r.value || "—"}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-[22px_1fr_1.4fr] items-center gap-2 py-2">
                    <BadgeCheck className="h-4 w-4" style={{ color: TEAL_DARK }} />
                    <div className="text-[12px]" style={{ color: "#6b7280" }}>Status</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-extrabold text-green-600">Paid</span>
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold bg-green-600">✓</span>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 grid grid-cols-[minmax(0,1fr)_84px] gap-4 items-center border rounded-xl px-4 py-3"
                  style={{ borderColor: `${TEAL}55` }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-[11.5px]" style={{ color: TEAL_DARK }}>
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>Appointment Token #{token}</span>
                    </div>
                    <p className="text-[10.5px] mt-1.5 leading-snug" style={{ color: "#6b7280" }}>
                      Keep this receipt for your records. It confirms your online payment for the appointment above.
                    </p>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Scan for location" className="w-[72px] h-[72px] rounded" />
                    ) : (
                      <div className="w-[72px] h-[72px] bg-muted rounded animate-pulse" />
                    )}
                    <div className="text-[9px] mt-1 font-medium" style={{ color: TEAL_DARK }}>Scan for Location</div>
                  </div>
                </div>

                <div className="text-center mt-4">
                  <div
                    className="text-[26px] leading-none"
                    style={{ color: TEAL_DARK, fontFamily: "'Great Vibes', 'Dancing Script', cursive", fontStyle: "italic" }}
                  >
                    Thank You!
                  </div>
                  <div className="text-[10.5px] mt-1" style={{ color: "#6b7280" }}>
                    We wish you good health.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div data-payment-slip-print-hide className="flex flex-wrap gap-2 justify-end p-4 border-t bg-secondary/40">
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

export default PaymentSlip;
