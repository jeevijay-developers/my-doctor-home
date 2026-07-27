import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Stethoscope, Building2, ClipboardList, Calendar, Clock, User, Phone,
  IndianRupee, BadgeCheck, MapPin, Mail, Globe, Bell, Video, Download, Printer, X, HeartPulse,
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
      margin: 1, width: 400, color: { dark: "#0A4E58", light: "#FFFFFF" },
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
    { icon: ClipboardList, label: "Service", value: service?.name || "" },
    { icon: type === "online" ? Video : Building2, label: "Type", value: type === "clinic" ? "Clinic Visit" : "Online Consultation" },
    { icon: Calendar, label: "Date", value: date ? format(date, "EEEE, d MMMM yyyy") : "" },
    { icon: Clock, label: "Time", value: time },
    { icon: User, label: "Patient", value: patientName },
    { icon: Phone, label: "Phone", value: patientPhone },
    { icon: IndianRupee, label: "Amount", value: service ? `₹${service.price}` : "" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0">
        <style>{`
          @media print {
            body.printing-slip > *:not([data-slip-print-root]) { display: none !important; }
            body.printing-slip [data-slip-print-root] { display: block !important; position: static !important; }
            [data-slip-print-hide] { display: none !important; }
            [data-slip-print-root] .slip-card { box-shadow: none !important; border: none !important; }
          }
        `}</style>

        <div data-slip-print-root>
          <div className="slip-card relative overflow-hidden bg-white">
            {/* Two column grid */}
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] relative">
              {/* Left teal panel with curved right edge */}
              <div
                className="relative text-white p-6 md:p-7 min-h-[520px] hidden md:flex flex-col justify-between"
                style={{
                  background: "linear-gradient(160deg, #0f6e7c 0%, #0a4e58 100%)",
                  clipPath: "path('M0,0 L240,0 C 200,260 240,520 240,780 L0,780 Z')",
                }}
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                      <div className="relative w-5 h-5">
                        <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-teal-700 rounded-sm" style={{ background: "#0a4e58" }} />
                        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-teal-700 rounded-sm" style={{ background: "#0a4e58" }} />
                      </div>
                    </div>
                    <div>
                      <div className="font-heading font-bold text-base leading-tight uppercase tracking-wide">
                        {clinicName}
                      </div>
                      <div className="text-[11px] italic opacity-80">{tagline}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 text-[11px] mt-6">
                  {clinicAddr && (
                    <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" /><span className="leading-snug break-words">{clinicAddr}</span></div>
                  )}
                  {clinicPhone && (
                    <div className="flex items-start gap-2"><Phone className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" /><span>{clinicPhone}</span></div>
                  )}
                  {clinicEmail && (
                    <div className="flex items-start gap-2"><Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" /><span className="break-all">{clinicEmail}</span></div>
                  )}
                  <div className="flex items-start gap-2"><Globe className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" /><span className="break-all">{websiteLabel}</span></div>
                </div>
              </div>

              {/* Mobile-only clinic header (since curved panel is hidden on mobile) */}
              <div className="md:hidden p-5 text-white" style={{ background: "linear-gradient(135deg, #0f6e7c, #0a4e58)" }}>
                <div className="font-heading font-bold text-lg uppercase tracking-wide">{clinicName}</div>
                <div className="text-xs italic opacity-80">{tagline}</div>
              </div>

              {/* Right content */}
              <div className="p-5 md:p-8 md:pl-4">
                {/* Emblem + heading */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center mb-3" style={{ borderColor: "#0f6e7c", color: "#0a4e58" }}>
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <h2 className="font-heading font-bold text-2xl md:text-3xl tracking-wide text-center" style={{ color: "#0a4e58" }}>
                    APPOINTMENT SLIP
                  </h2>
                  <div className="flex items-center gap-1 mt-2 mb-4 w-full max-w-xs" style={{ color: "#0f6e7c" }}>
                    <div className="h-px flex-1 bg-current opacity-60" />
                    <HeartPulse className="h-4 w-4" />
                    <div className="h-px flex-1 bg-current opacity-60" />
                  </div>

                  {/* Token box */}
                  <div className="border-2 rounded-xl px-8 py-3 text-center mb-6" style={{ borderColor: "#0f6e7c" }}>
                    <div className="text-[11px] tracking-widest text-muted-foreground">TOKEN</div>
                    <div className="font-heading font-bold text-3xl md:text-4xl" style={{ color: "#0a4e58" }}>
                      #{token}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="divide-y divide-slate-200">
                  {rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[28px_90px_1fr] items-center gap-2 py-2.5">
                      <r.icon className="h-4 w-4" style={{ color: "#0a4e58" }} />
                      <div className="text-sm text-muted-foreground">{r.label}</div>
                      <div className="text-sm font-semibold break-words" style={{ color: "#0a4e58" }}>{r.value || "—"}</div>
                    </div>
                  ))}

                  {/* Payment status (if provided) */}
                  {paymentStatus && (
                    <div className="grid grid-cols-[28px_90px_1fr] items-center gap-2 py-2.5">
                      <IndianRupee className="h-4 w-4" style={{ color: "#0a4e58" }} />
                      <div className="text-sm text-muted-foreground">Payment</div>
                      <div className="text-sm font-semibold capitalize" style={{ color: "#0a4e58" }}>
                        {paymentStatus.replace(/_/g, " ")}
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div className="grid grid-cols-[28px_90px_1fr] items-center gap-2 py-2.5">
                    <BadgeCheck className="h-4 w-4" style={{ color: "#0a4e58" }} />
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${statusIsConfirmed ? "text-green-600" : "text-amber-600"}`}>{statusLabel}</span>
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold ${statusIsConfirmed ? "bg-green-600" : "bg-amber-500"}`}>
                        {statusIsConfirmed ? "✓" : "!"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reminder + QR */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 border rounded-xl p-4" style={{ borderColor: "#0f6e7c33" }}>
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm" style={{ color: "#0a4e58" }}>
                      <Bell className="h-4 w-4" /> PLEASE ARRIVE 10 MINUTES EARLY
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Carry a valid ID proof and any previous medical documents or prescriptions relevant to your visit.
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Scan to visit doctor's website" className="w-24 h-24 rounded-md border" />
                    ) : (
                      <div className="w-24 h-24 bg-muted rounded-md animate-pulse" />
                    )}
                    <div className="text-[10px] font-semibold mt-1 text-center leading-tight" style={{ color: "#0a4e58" }}>
                      Scan to Visit<br />Doctor's Website
                    </div>
                  </div>
                </div>

                {/* Thank you */}
                <div className="text-center mt-6">
                  <div className="font-serif italic text-2xl" style={{ color: "#0a4e58" }}>Thank You!</div>
                  <div className="text-xs text-muted-foreground">We wish you good health.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons (hidden on print) */}
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
