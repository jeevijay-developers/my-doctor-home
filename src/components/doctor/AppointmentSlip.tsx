import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Stethoscope, Building2, ClipboardList, Calendar, Clock, User, Phone,
  IndianRupee, BadgeCheck, MapPin, Globe, Bell, Download, Printer, X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import doctyliaLogo from "@/assets/doctylia-logo.png";
import { getClinicMapsUrl } from "@/lib/clinicLocation";

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
  // When set, overrides the settings.auto_confirm inference below with the
  // real DB status — used for the pay-first online flow, where payment
  // success always means the appointment was actually created as "confirmed".
  forceConfirmed?: boolean;
  onDownload: () => void;
};

const TEAL_DARK = "#0a4e58";
const TEAL = "#0f6e7c";
const TEAL_LIGHT = "#1c8a99";

// Subtle repeating "+" texture for the sidebar, tiled via CSS background-image.
const PLUS_PATTERN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 12v16M12 20h16' stroke='%23ffffff' stroke-opacity='0.08' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";

const AppointmentSlip = ({
  open, onClose, profile, settings, token, service, type, date, time,
  patientName, patientPhone, paymentStatus, forceConfirmed, onDownload,
}: Props) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const tagline = profile?.tagline || "Care You Can Trust";
  const clinicAddr = profile?.clinic_address || profile?.address || profile?.city || "";
  const clinicPhone = profile?.clinic_phone || profile?.phone || "";
  const websiteLabel = doctorUrl.replace(/^https?:\/\//, "");
  const locationUrl = getClinicMapsUrl(profile) || doctorUrl;

  const statusIsConfirmed = forceConfirmed ?? Boolean(settings?.auto_confirm);
  const statusLabel = statusIsConfirmed ? "Confirmed" : "Pending";

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
            {/* Solid teal sidebar panel with subtle "+" texture */}
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

            {/* CONTENT LAYER */}
            <div className="relative grid grid-cols-[36%_64%] h-full">
              {/* LEFT COLUMN */}
              <div className="flex flex-col text-white p-4 md:p-5">
                {/* Logo card */}
                <div className="bg-white rounded-lg px-3 py-2 flex items-center justify-center shadow-sm">
                  <img
                    src={doctyliaLogo}
                    alt="Doctylia"
                    className="h-7 w-auto object-contain shrink-0"
                  />
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
                {/* Header badge + title */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                    style={{ backgroundColor: `${TEAL}1a`, color: TEAL_DARK }}
                  >
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2
                    className="font-heading font-extrabold text-2xl md:text-[26px] tracking-wider text-center"
                    style={{ color: TEAL_DARK }}
                  >
                    APPOINTMENT SLIP
                  </h2>
                  {/* Divider */}
                  <div className="w-12 h-[3px] rounded-full mt-2 mb-4" style={{ backgroundColor: TEAL }} aria-hidden />

                  {/* Token box */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", marginBottom: "20px" }}>
                    <div style={{ fontSize: "11.5px", fontWeight: 500, textAlign: "center", marginBottom: "6px", color: "#6b7280" }}>
                      Token Number
                    </div>
                    {/*
                      lineHeight === containerHeight - (2 × borderWidth) is the classic,
                      html2canvas-safe single-line vertical centering trick.
                      52px height - 2px top border - 2px bottom border = 48px line-height.
                    */}
                    <div
                      style={{
                        borderWidth: "2px",
                        borderStyle: "solid",
                        borderColor: TEAL,
                        borderRadius: "9999px",
                        width: "220px",
                        height: "52px",
                        lineHeight: "48px",
                        boxSizing: "border-box",
                        margin: "0 auto",
                        textAlign: "center",
                        fontSize: "26px",
                        fontWeight: 800,
                        letterSpacing: "0.03em",
                        color: TEAL_DARK,
                        fontFamily: "inherit",
                        overflow: "hidden",
                      }}
                    >
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
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          statusIsConfirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {statusIsConfirmed ? <BadgeCheck className="h-3 w-3" /> : null}
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </div>



                {/* Instruction + QR */}
                <div
                  className="mt-4 grid grid-cols-[minmax(0,1fr)_84px] gap-4 items-center rounded-xl px-4 py-3"
                  style={{ backgroundColor: "#f0f3ff" }}
                >
                  <div className="min-w-0 flex items-start gap-2">
                    <Bell className="h-4 w-4 mt-0.5 shrink-0" style={{ color: TEAL_DARK }} />
                    <p className="text-[10.5px] leading-snug" style={{ color: "#4b5563" }}>
                      Please arrive 10 minutes early. Remember to bring any relevant medical records or ID if required.
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
