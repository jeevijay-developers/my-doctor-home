import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Stethoscope, Building2, Calendar, Clock, User, Phone,
  IndianRupee, BadgeCheck, MapPin, Globe, Receipt, Download, Printer, X, Hash,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import doctyliaLogo from "@/assets/doctylia-logo.png";
import { getClinicMapsUrl } from "@/lib/clinicLocation";

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

// Subtle repeating "+" texture for the sidebar, tiled via CSS background-image.
// Mirrors AppointmentSlip so both documents share one visual language.
const PLUS_PATTERN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 12v16M12 20h16' stroke='%23ffffff' stroke-opacity='0.08' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";

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
  const websiteLabel = doctorUrl.replace(/^https?:\/\//, "");
  const locationUrl = getClinicMapsUrl(profile) || doctorUrl;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(locationUrl, {
      margin: 1, width: 400, color: { dark: TEAL_DARK, light: "#FFFFFF" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [open, locationUrl]);

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
              style={{
                width: "36%",
                backgroundColor: TEAL_DARK,
                backgroundImage: `url("${PLUS_PATTERN}")`,
                backgroundSize: "40px 40px",
              }}
              aria-hidden
            />

            <div className="relative grid grid-cols-[36%_64%] h-full">
              {/* LEFT COLUMN — logo + clinic contact only, no photo */}
              <div className="flex flex-col text-white p-4 md:p-5">
                {/* Logo card */}
                <div className="bg-white rounded-lg px-3 py-2 flex items-center justify-center shadow-sm">
                  <img src={doctyliaLogo} alt="Doctylia" className="h-7 w-auto object-contain shrink-0" />
                </div>
                <h3 className="mt-3 text-center text-[12.5px] font-bold leading-snug">
                  Trusted Care for Your Family
                </h3>
                <p className="text-center text-[9px] text-white/70 mt-0.5">
                  Dedicated to your well-being
                </p>
                <div className="h-px w-10 bg-white/25 mx-auto mt-3" aria-hidden />

                {/* Contact block — pinned to the bottom, nudged up a few px */}
                <div className="mt-auto space-y-3 text-[9.5px] pb-4">
                  {clinicAddr && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-white/75" />
                      <div className="min-w-0">
                        <div className="text-[8px] uppercase tracking-wider text-white/55 font-semibold">Clinic Location</div>
                        <div className="leading-snug break-words text-white/95 font-medium">{clinicAddr}</div>
                      </div>
                    </div>
                  )}
                  {clinicPhone && (
                    <div className="flex items-start gap-2">
                      <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0 text-white/75" />
                      <div className="min-w-0">
                        <div className="text-[8px] uppercase tracking-wider text-white/55 font-semibold">Clinic Phone</div>
                        <div className="break-all text-white/95 font-medium">{clinicPhone}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0 text-white/75" />
                    <div className="min-w-0">
                      <div className="text-[8px] uppercase tracking-wider text-white/55 font-semibold">Clinic Website</div>
                      <div className="break-all leading-snug text-white/95 font-medium">{websiteLabel}</div>
                    </div>
                  </div>
                </div>

                <div className="text-center text-[7px] tracking-[0.2em] text-white/45 font-bold">
                  YOUR HEALTH, OUR PRIORITY
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="flex flex-col p-5 md:p-6 pl-5 md:pl-7">
                <div className="flex flex-col items-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                    style={{ backgroundColor: `${TEAL}1a`, color: TEAL_DARK }}
                  >
                    <Receipt className="h-6 w-6" />
                  </div>
                  <h2
                    className="font-heading font-extrabold text-2xl md:text-[26px] tracking-wider text-center"
                    style={{ color: TEAL_DARK }}
                  >
                    PAYMENT RECEIPT
                  </h2>
                  {/* Divider */}
                  <div className="w-12 h-[3px] rounded-full mt-2 mb-4" style={{ backgroundColor: TEAL }} aria-hidden />

                  {/* Amount box */}
                  <div className="flex flex-col items-center justify-center mb-5 w-full">
                    <div className="text-[11.5px] font-medium text-center mb-2" style={{ color: "#6b7280" }}>
                      Amount Paid
                    </div>
                    <div
                      className="border-[2px] rounded-full w-[220px] h-[50px] flex items-center justify-center text-center mx-auto"
                      style={{ borderColor: TEAL, padding: 0, boxSizing: "border-box" }}
                    >
                      <div
                        className="font-heading font-extrabold text-[26px] text-center w-full flex items-center justify-center gap-0.5"
                        style={{
                          color: TEAL_DARK,
                          lineHeight: "46px",
                          letterSpacing: "0.03em",
                          margin: 0,
                          padding: 0,
                        }}
                      >
                        <IndianRupee className="h-5 w-5" />{amount}
                      </div>
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
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-green-100 text-green-700">
                        <BadgeCheck className="h-3 w-3" /> Paid
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 grid grid-cols-[minmax(0,1fr)_84px] gap-4 items-center rounded-xl px-4 py-3"
                  style={{ backgroundColor: "#f0f3ff" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-[11.5px]" style={{ color: TEAL_DARK }}>
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>Appointment Token #{token}</span>
                    </div>
                    <p className="text-[10.5px] mt-1.5 leading-snug" style={{ color: "#4b5563" }}>
                      Keep this receipt for your records. It confirms your online payment for the appointment above.
                    </p>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className="bg-white rounded-lg p-1.5 border" style={{ borderColor: "#e2e8f0" }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Scan for location" className="w-[64px] h-[64px] rounded" />
                      ) : (
                        <div className="w-[64px] h-[64px] bg-muted rounded animate-pulse" />
                      )}
                    </div>
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
