import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Stethoscope, Building2, ClipboardList, Calendar, Clock, User, Phone,
  IndianRupee, BadgeCheck, MapPin, Mail, Globe, Bell, Video, Download, Printer, X, Plus,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  settings: any;
  token: string;
  service: { name: string; price: number } | null;
  type: "clinic" | "online";
  date: Date | null;
  time: string;
  patientName: string;
  patientPhone: string;
  paymentStatus?: string;
  onDownload: () => void;
};

const TEAL_DARK = "#0a4e58";
const TEAL = "#0f6e7c";
const TEAL_LIGHT = "#1c8a99";

const AppointmentSlip = ({
  open, onClose, profile, settings, token, service, type, date, time,
  patientName, patientPhone, paymentStatus, onDownload,
}: Props) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const tagline = profile?.tagline || "Care You Can Trust";
  const clinicAddr = profile?.clinic_address || profile?.address || profile?.city || "";
  const clinicPhone = profile?.clinic_phone || profile?.phone || "";
  const clinicEmail = profile?.clinic_email || profile?.email || "";
  const websiteLabel = doctorUrl.replace(/^https?:\/\//, "");

  const statusLabel = settings?.auto_confirm ? "Confirmed" : "Pending";
  const statusIsConfirmed = Boolean(settings?.auto_confirm);

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
    { icon: Stethoscope, label: "Service", value: service?.name || "" },
    { icon: ClipboardList, label: "Type", value: type === "clinic" ? "Clinic Visit" : "Online Consultation" },
    { icon: Calendar, label: "Date", value: date ? format(date, "EEEE, d MMMM yyyy") : "" },
    { icon: Clock, label: "Time", value: time },
    { icon: User, label: "Patient", value: patientName },
    { icon: Phone, label: "Phone", value: patientPhone },
    { icon: IndianRupee, label: "Amount", value: service ? `₹${service.price}` : "" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[720px] p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 bg-white">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body.printing-slip > *:not([data-slip-print-root]) { display: none !important; }
            body.printing-slip [data-slip-print-root] { display: block !important; position: static !important; }
            [data-slip-print-hide] { display: none !important; }
            [data-slip-print-root] .slip-card { box-shadow: none !important; border: none !important; }
          }
        `}</style>

        <div data-slip-print-root>
          <div className="slip-card relative bg-white overflow-hidden" style={{ aspectRatio: "1 / 1.45" }}>
            {/* Curved teal panel — SVG covers left with a diagonal curve */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 720 1044"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={TEAL_LIGHT} />
                  <stop offset="60%" stopColor={TEAL} />
                  <stop offset="100%" stopColor={TEAL_DARK} />
                </linearGradient>
              </defs>
              {/* Teal panel constrained to left sidebar area only */}
              <path
                d="M 0 0 L 230 0 Q 250 340 235 560 Q 220 800 250 1044 L 0 1044 Z"
                fill="url(#tealGrad)"
              />
              {/* Decorative thin curve accent along the edge */}
              <path
                d="M 230 0 Q 250 340 235 560 Q 220 800 250 1044"
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
            </svg>


            {/* CONTENT LAYER */}
            <div className="relative grid grid-cols-[34%_66%] h-full">
              {/* LEFT COLUMN */}
              <div className="flex flex-col justify-between text-white p-4 md:p-5">
                {/* Logo + clinic name */}
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <Plus className="h-5 w-5" strokeWidth={3.5} style={{ color: TEAL_DARK }} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="font-heading font-extrabold text-[13px] md:text-[14px] leading-tight uppercase tracking-wide break-words">
                      {clinicName}
                    </div>
                    <div className="text-[9.5px] italic opacity-90 mt-1 leading-snug">{tagline}</div>
                  </div>
                </div>

                {/* Contact — white text on teal curved panel */}
                <div className="space-y-2 text-[10px] pb-1 text-white">
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
                    <div className="flex items-start gap-1.5">
                      <Mail className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="break-all leading-snug">{clinicEmail}</span>
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
                {/* Header badge + title */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-12 h-12 rounded-full border-[2.5px] flex items-center justify-center mb-2"
                    style={{ borderColor: TEAL, color: TEAL_DARK }}
                  >
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2
                    className="font-heading font-extrabold text-2xl md:text-[26px] tracking-wider text-center"
                    style={{ color: TEAL_DARK }}
                  >
                    APPOINTMENT SLIP
                  </h2>
                  {/* Heartbeat divider */}
                  <svg width="180" height="16" viewBox="0 0 180 16" className="mt-1.5 mb-4" aria-hidden>
                    <path
                      d="M0 8 L60 8 L68 8 L74 2 L82 14 L90 5 L98 11 L106 8 L180 8"
                      fill="none" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>

                  {/* Token box */}
                  <div
                    className="border-[2px] rounded-xl px-8 py-2.5 text-center mb-5 min-w-[200px]"
                    style={{ borderColor: TEAL }}
                  >
                    <div className="text-[10.5px] tracking-[0.3em] font-semibold" style={{ color: TEAL }}>TOKEN</div>
                    <div className="font-heading font-extrabold text-[30px] leading-none mt-0.5" style={{ color: TEAL_DARK }}>
                      #{token}
                    </div>
                  </div>
                </div>

                {/* Details list */}
                <div className="divide-y" style={{ borderColor: `${TEAL}22` }}>
                  {rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[22px_1fr_1.4fr] items-center gap-2 py-2">
                      <r.icon className="h-4 w-4" style={{ color: TEAL_DARK }} />
                      <div className="text-[12px]" style={{ color: "#6b7280" }}>{r.label}</div>
                      <div className="text-[13px] font-bold break-words" style={{ color: TEAL_DARK }}>
                        {r.value || "—"}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-[22px_1fr_1.4fr] items-center gap-2 py-2">
                    <BadgeCheck className="h-4 w-4" style={{ color: TEAL_DARK }} />
                    <div className="text-[12px]" style={{ color: "#6b7280" }}>Status</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[13px] font-extrabold ${statusIsConfirmed ? "text-green-600" : "text-amber-600"}`}>
                        {statusLabel}
                      </span>
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold ${statusIsConfirmed ? "bg-green-600" : "bg-amber-500"}`}>
                        {statusIsConfirmed ? "✓" : "!"}
                      </span>
                    </div>
                  </div>
                  {paymentStatus && (
                    <div className="grid grid-cols-[22px_1fr_1.4fr] items-center gap-2 py-2">
                      <IndianRupee className="h-4 w-4" style={{ color: TEAL_DARK }} />
                      <div className="text-[12px]" style={{ color: "#6b7280" }}>Payment</div>
                      <div className="text-[13px] font-bold capitalize" style={{ color: TEAL_DARK }}>
                        {paymentStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Instruction + QR */}
                <div
                  className="mt-4 grid grid-cols-[minmax(0,1fr)_84px] gap-4 items-center border rounded-xl px-4 py-3"
                  style={{ borderColor: `${TEAL}55` }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-[11.5px]" style={{ color: TEAL_DARK }}>
                      <Bell className="h-3.5 w-3.5 shrink-0" />
                      <span>PLEASE ARRIVE 10 MINUTES EARLY</span>
                    </div>
                    <p className="text-[10.5px] mt-1.5 leading-snug" style={{ color: "#6b7280" }}>
                      Carry a valid ID proof and previous medical documents (if any).
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


                {/* Thank you */}
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

          <div data-slip-print-hide className="flex flex-wrap gap-2 justify-end p-4 border-t bg-secondary/40">
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

export default AppointmentSlip;
