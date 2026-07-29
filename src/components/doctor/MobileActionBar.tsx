import { Phone, MessageCircle, Calendar } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const MobileActionBar = () => {
  const { profile, settings } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;

  const hasAny = profile?.phone || whatsappUrl;
  if (!hasAny) {
    // Still show Book button on mobile for consistency
  }

  return (
    <>
      {/* Spacer so page content isn't hidden under the bar */}
      <div className="lg:hidden h-20" aria-hidden />
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] px-3 py-2.5">
        <div className="max-w-md mx-auto flex items-center gap-2">
          {profile?.phone && (
            <a
              href={`tel:${profile.phone}`}
              aria-label="Call doctor"
              className="btn-pop flex-1 flex items-center justify-center gap-1.5 h-11 rounded-full bg-secondary text-royal font-heading font-semibold text-sm"
            >
              <Phone size={16} /> Call
            </a>
          )}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              className="btn-pop flex-1 flex items-center justify-center gap-1.5 h-11 rounded-full bg-success/10 text-success font-heading font-semibold text-sm"
            >
              <MessageCircle size={16} /> Chat
            </a>
          )}
          <button
            onClick={() => scrollTo("booking")}
            className="btn-pop flex-[1.4] flex items-center justify-center gap-1.5 h-11 rounded-full bg-primary text-primary-foreground font-heading font-semibold text-sm shadow"
          >
            <Calendar size={16} /> Book Appointment
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileActionBar;
