import { useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  id?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  /** False for days the clinic is closed (and anything else that cannot be booked). */
  isAvailable: (date: Date) => boolean;
  /** First and last bookable day: the doctor's booking window. */
  fromDate: Date;
  toDate: Date;
  disabled?: boolean;
};

/**
 * A date field that opens a month calendar. Days outside the booking window and days the clinic
 * is closed are greyed out and cannot be chosen. Themed with the doctor-site tokens (the shared
 * Calendar is configured, not edited).
 */
const DatePicker = ({ id, value, onChange, isAvailable, fromDate, toDate, disabled }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="flex h-12 w-full items-center justify-between gap-3 rounded-ds-sm border border-ds-line bg-ds-surface px-4 text-left text-ds-body text-ds-ink ds-tabular outline-none transition-colors hover:border-ds-ink/30 focus-visible:border-ds-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <CalendarDays aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-ds-ink-3" strokeWidth={1.75} />
            <span className="truncate">{value ? format(value, "EEE, d MMM yyyy") : "Choose a date"}</span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-ink-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="doctor-site w-auto rounded-ds-md border-ds-line !bg-ds-surface p-2 text-ds-ink shadow-ds-2" data-lenis-prevent>
        <Calendar
          mode="single"
          required
          selected={value ?? undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
          // fromDate/toDate only limit which months can be browsed; days outside the window must be disabled too.
          disabled={(date) => date < startOfDay(fromDate) || date > endOfDay(toDate) || !isAvailable(date)}
          fromDate={fromDate}
          toDate={toDate}
          defaultMonth={value ?? fromDate}
          showOutsideDays={false}
          captionLayout="buttons"
          className="p-1"
          classNames={{
            months: "flex flex-col",
            month: "space-y-3",
            caption: "relative flex items-center justify-center pt-1",
            caption_label: "font-ds-display text-[1.0625rem] font-medium text-ds-ink",
            nav_button:
              "inline-flex h-10 w-10 items-center justify-center rounded-full border border-ds-line bg-transparent p-0 text-ds-ink opacity-80 transition-colors hover:bg-ds-ink/[0.06] hover:opacity-100 disabled:opacity-30",
            nav_button_previous: "absolute left-0",
            nav_button_next: "absolute right-0",
            head_row: "flex",
            head_cell: "w-11 text-center text-ds-label font-medium text-ds-ink-3",
            row: "mt-1 flex w-full",
            cell: "relative h-11 w-11 p-0 text-center text-ds-small",
            day: "inline-flex h-11 w-11 items-center justify-center rounded-full p-0 text-ds-small font-medium text-ds-ink ds-tabular transition-colors hover:bg-ds-ink/[0.08] aria-selected:opacity-100",
            day_selected: "!bg-ds-accent !text-white hover:!bg-ds-accent-hover",
            day_today: "ring-1 ring-ds-ink/40",
            day_disabled: "cursor-not-allowed text-ds-ink-3 opacity-35 hover:bg-transparent",
            day_hidden: "invisible",
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
