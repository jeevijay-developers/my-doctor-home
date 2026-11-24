import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { choose, columnsFor, formatField, pad2, type Period } from "@/lib/doctorSite/timeColumns";
import { radioKeyDown } from "../ui/radioKeyDown";

type Props = {
  id?: string;
  /** The FREE slots only ("HH:MM", 24-hour): booked, past and out-of-hours times are not in this list. */
  slots: string[];
  value: string;
  onChange: (slot: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
};

const optionClass = (selected: boolean) =>
  `flex h-11 w-full items-center justify-center rounded-ds-sm text-ds-small ds-tabular transition-colors duration-ds-1 disabled:cursor-not-allowed disabled:opacity-35 ${
    selected ? "bg-ds-accent font-semibold text-white" : "text-ds-ink hover:bg-ds-ink/[0.06]"
  }`;

/**
 * A time field that opens hour | minute | AM/PM columns (like the browser's own time input), but
 * only ever offers times that are actually free: an hour with nothing free is not listed, the
 * minutes shown are only the free ones for that hour, and AM/PM is disabled when that half of the
 * day has no free slot. Every choice therefore maps to a real bookable slot.
 */
const TimePicker = ({ id, slots, value, onChange, disabled, emptyLabel = "No times available" }: Props) => {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const columns = columnsFor(slots, value);
  const current = columns.current;
  const empty = slots.length === 0 || !current;

  // On open, scroll each column so the selected value is in view.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.querySelectorAll<HTMLElement>('[role="radiogroup"]').forEach((group) => {
        const selected = group.querySelector<HTMLElement>('[aria-checked="true"]');
        if (selected) group.scrollTop = selected.offsetTop - group.clientHeight / 2 + selected.clientHeight / 2;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const pick = (change: { hour?: number; minute?: number; period?: Period }, close = false) => {
    onChange(choose(slots, value, change));
    if (close) setOpen(false);
  };

  return (
    <Popover open={open && !empty} onOpenChange={(next) => setOpen(next && !empty)}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled || empty}
          className="flex h-12 w-full items-center justify-between gap-3 rounded-ds-sm border border-ds-line bg-ds-surface px-4 text-left text-ds-body text-ds-ink ds-tabular outline-none transition-colors hover:border-ds-ink/30 focus-visible:border-ds-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Clock aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-ds-ink-3" strokeWidth={1.75} />
            <span className="truncate">{empty ? emptyLabel : formatField(current.time)}</span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-ink-3" />
        </button>
      </PopoverTrigger>

      {/* Portalled outside .doctor-site, so it carries the scope itself. */}
      <PopoverContent
        ref={contentRef}
        align="start"
        className="doctor-site w-auto rounded-ds-md border-ds-line !bg-ds-surface p-2 text-ds-ink shadow-ds-2"
      >
        {current && (
          <div className="flex gap-1">
            <div role="radiogroup" aria-label="Hour" onKeyDown={radioKeyDown} data-lenis-prevent className="relative max-h-60 w-16 space-y-0.5 overflow-y-auto p-0.5">
              {columns.hours.map((hour) => (
                <button key={hour} type="button" role="radio" aria-checked={hour === current.hour12} tabIndex={hour === current.hour12 ? 0 : -1} onClick={() => pick({ hour })} className={optionClass(hour === current.hour12)}>
                  {pad2(hour)}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Minute" onKeyDown={radioKeyDown} data-lenis-prevent className="relative max-h-60 w-16 space-y-0.5 overflow-y-auto p-0.5">
              {columns.minutes.map((minute) => (
                <button key={minute} type="button" role="radio" aria-checked={minute === current.minute} tabIndex={minute === current.minute ? 0 : -1} onClick={() => pick({ minute }, true)} className={optionClass(minute === current.minute)}>
                  {pad2(minute)}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="AM or PM" onKeyDown={radioKeyDown} className="w-16 space-y-0.5 p-0.5">
              {(["AM", "PM"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  role="radio"
                  aria-checked={period === current.period}
                  tabIndex={period === current.period ? 0 : -1}
                  disabled={!columns.periods[period]}
                  onClick={() => pick({ period })}
                  className={optionClass(period === current.period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default TimePicker;
