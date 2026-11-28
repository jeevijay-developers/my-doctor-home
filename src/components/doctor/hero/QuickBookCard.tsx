import { useId } from "react";
import { useSpotlight } from "../effects/useSpotlight";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarClock } from "lucide-react";
import { relativeDayLabel, SELECT_SLOT_EVENT, slotLabel, type NextAvailable, type SelectSlotDetail } from "@/lib/doctorSite/nextAvailable";
import DsButton from "../ui/DsButton";
import { bookNow } from "../siteActions";
import { SELECT_DOCTOR_EVENT } from "../DoctorsSection";
import { DUR, EASE } from "../motion/tokens";
import type { useNextAvailable } from "./useNextAvailable";

type Props = {
  state: ReturnType<typeof useNextAvailable>;
  fee: number | null;
  /** On a doctor's own page: book with THIS doctor, whatever the widget had selected. */
  doctorId?: string;
};

/** A slot found at page load may have passed if the tab stayed open. */
const stillAhead = (slot: NextAvailable, now = new Date()) => {
  const [h, m] = slot.time.split(":").map(Number);
  const start = new Date(slot.date);
  start.setHours(h, m, 0, 0);
  return start.getTime() > now.getTime();
};

/**
 * The hero's one-tap booking entry (spec §6.5): shows the earliest free slot and
 * books straight into it — the booking widget opens on patient details with that
 * date and time already chosen (it re-checks the slot is still free). The button
 * works in every state, so a patient never waits on the lookup.
 */
const QuickBookCard = ({ state, fee, doctorId }: Props) => {
  const spotlight = useSpotlight<HTMLDivElement>();
  const slot = state.status === "found" ? state.slot : null;
  const slotTextId = useId();

  const pickDoctor = () => {
    if (doctorId) window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctorId } }));
  };
  const openBooking = () => {
    pickDoctor();
    bookNow();
  };

  const bookSlot = () => {
    if (!slot || !stillAhead(slot)) {
      openBooking();
      return;
    }
    pickDoctor();
    const detail: SelectSlotDetail = { dateKey: slot.dateKey, time: slot.time, type: "clinic" };
    window.dispatchEvent(new CustomEvent(SELECT_SLOT_EVENT, { detail }));
    bookNow();
  };

  return (
    <div {...spotlight} className="ds-glass ds-spotlight relative overflow-hidden rounded-ds-md p-5 !shadow-ds-2 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ds-eyebrow">{slot ? `Next available · ${relativeDayLabel(slot.date)}` : "Book a visit"}</p>
          <AnimatePresence mode="wait" initial={false}>
            {state.status === "loading" ? (
              // Same height as the loaded text (time line + "Clinic visit" line) so nothing below shifts.
              <motion.div key="loading" exit={{ opacity: 0 }} className="mt-1.5" role="status">
                <span className="sr-only">Finding the next free time…</span>
                <div aria-hidden="true" className="ds-skeleton h-10 w-48" />
                <div aria-hidden="true" className="ds-skeleton mt-1 h-[1.375rem] w-32" />
              </motion.div>
            ) : (
              <motion.div
                key={slot ? `${slot.dateKey}-${slot.time}` : "none"}
                id={slotTextId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DUR.small, ease: EASE.out }}
              >
                <p className="mt-1.5 whitespace-nowrap font-ds-display text-[2rem] font-medium leading-tight ds-tabular sm:text-[2.25rem]">
                  {slot ? (
                    <>
                      <span className="sr-only">{relativeDayLabel(slot.date)}, </span>
                      {slotLabel(slot.time)}
                    </>
                  ) : (
                    <span className="whitespace-normal">Pick a time that suits you</span>
                  )}
                </p>
                <p className="mt-1 text-ds-small text-ds-ink-2">
                  Clinic visit{fee ? <> · <span className="ds-tabular">₹{fee}</span></> : null}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ds-accent-soft text-ds-accent-ink">
          <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <DsButton
          size="lg"
          onClick={bookSlot}
          aria-describedby={slot ? slotTextId : undefined}
          className="w-full sm:w-auto"
        >
          {slot ? "Book this slot" : state.status === "loading" ? "Book appointment" : "Choose a time"}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </DsButton>
        {state.status !== "none" && (
          // Rendered while loading too (invisible), so the card does not grow when the slot arrives.
          <button
            type="button"
            onClick={openBooking}
            aria-hidden={slot ? undefined : true}
            tabIndex={slot ? undefined : -1}
            className={`min-h-12 rounded-full px-4 text-ds-small font-medium text-ds-ink-2 underline decoration-ds-line underline-offset-4 transition-colors hover:text-ds-ink hover:decoration-ds-ink ${slot ? "" : "invisible"}`}
          >
            See other times
          </button>
        )}
      </div>
    </div>
  );
};

export default QuickBookCard;
