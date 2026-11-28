import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck2, Phone, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useDoctorData } from "@/contexts/DoctorContext";
import { clinicPhone, telHref, whatsappHref, siteLabels } from "@/lib/doctorSite/doctorFacts";
import { clinicDisplayName } from "@/lib/doctorSite/teamClinic";
import { dsScrollTo } from "./motion/scroll";
import DsButton from "./ui/DsButton";
import { dsCn as cn } from "./ui/dsCn";
import { useSectionInView } from "./ui/useActiveSection";
import { bookNow } from "./siteActions";
import { SPRING_SOFT } from "./motion/tokens";

/** True while a text field has focus (the on-screen keyboard is up on phones). */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return typing;
}

const iconAction =
  "flex h-14 w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-ds-md text-ds-label font-medium text-ds-ink " +
  "transition-colors hover:bg-ds-ink/[0.06] active:bg-ds-ink/[0.1]";

/**
 * Persistent, thumb-reachable actions so booking, calling and WhatsApp are one
 * tap from anywhere on the page (spec §5.2).
 * - Phones (< md): a frosted bar fixed to the bottom.
 * - Tablet/desktop: a compact dock in the bottom-right corner once the hero has
 *   scrolled away (the navbar already shows "Book" at the top).
 * Both step aside while the booking section itself is on screen, and the phone
 * bar also hides while the keyboard is up so it never covers a form field.
 */
const BottomActionBar = () => {
  const { profile, settings, isTeamClinic } = useDoctorData();
  const team = isTeamClinic === true;
  const regionLabel = team ? `Quick actions for ${clinicDisplayName(profile)}` : "Quick actions";
  const labels = siteLabels(settings);
  const phone = clinicPhone(profile);
  const whatsapp = whatsappHref(settings);
  const bookingVisible = useSectionInView("booking-zone", "-30% 0px -30% 0px");
  const heroVisible = useSectionInView("top", "0px 0px -20% 0px");
  const typing = useTyping();
  // With Doctors, Call and WhatsApp beside it, Book gets a short label so it never truncates on a 360px phone.
  const compact = team && Boolean(phone) && Boolean(whatsapp);

  const showPhoneBar = !bookingVisible && !typing;
  const showDock = !bookingVisible && !heroVisible;

  return (
    <>
      <AnimatePresence>
        {showPhoneBar && (
          <motion.div
            key="ds-bottom-bar"
            role="region"
            aria-label={regionLabel}
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={SPRING_SOFT}
            className="ds-glass ds-glass-strong fixed inset-x-0 bottom-0 z-40 rounded-t-ds-md px-2.5 pt-2 !shadow-ds-3 md:hidden"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-md items-center gap-1.5">
              <DsButton size="lg" onClick={bookNow} className="min-w-0 flex-1 px-4" aria-label={compact ? labels.book : undefined}>
                <CalendarCheck2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                {compact ? "Book" : labels.book}
              </DsButton>
              {team && (
                <button type="button" onClick={() => dsScrollTo("doctors", { focusSelector: "h2" })} className={cn(iconAction, compact && "w-[3.75rem]")}>
                  <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  Doctors
                </button>
              )}
              {phone && (
                <a href={telHref(phone)} className={cn(iconAction, compact && "w-[3.75rem]")}>
                  <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  Call
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className={cn(iconAction, compact && "w-[3.75rem]")}>
                  <span aria-hidden="true" className="flex"><WhatsAppIcon className="h-5 w-5" /></span>
                  WhatsApp
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDock && (
          <motion.div
            key="ds-dock"
            role="region"
            aria-label={regionLabel}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={SPRING_SOFT}
            className="ds-glass fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full p-1.5 !shadow-ds-2 md:flex"
          >
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label="Chat with the clinic on WhatsApp"
                className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-ds-ink/[0.06]"
              >
                <span aria-hidden="true" className="flex"><WhatsAppIcon className="h-7 w-7" /></span>
              </a>
            )}
            {phone && (
              <a
                href={telHref(phone)}
                aria-label={`Call the clinic, ${phone}`}
                className="flex h-12 w-12 items-center justify-center rounded-full text-ds-ink transition-colors hover:bg-ds-ink/[0.06]"
              >
                <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
            <DsButton onClick={bookNow}>
              <CalendarCheck2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              {labels.book}
            </DsButton>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BottomActionBar;
