import { dayIntervals, getClinicStatus, istNow, type WorkingHoursRow } from "@/lib/doctorSite/clinicStatus";
import { formatDayRangeLabel, groupWorkingHours } from "@/lib/workingHoursGrouping";
import { dsCn } from "../ui/dsCn";
import { useNow } from "../ui/useNow";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Row = WorkingHoursRow & Record<string, unknown>;

/** One doctor's weekly hours (days with the same hours grouped), today marked, plus an Open now chip. */
const DoctorHours = ({ rows, name }: { rows: Row[]; name: string }) => {
  const now = useNow();
  const today = istNow(now).day;
  const groups = groupWorkingHours([...rows].sort((a, b) => a.day_of_week - b.day_of_week) as never) as Array<{ days: number[]; sample: Row }>;
  const status = getClinicStatus(rows, now);

  return (
    <section id="hours" aria-labelledby="doctor-hours">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="doctor-hours" className="font-ds-display text-ds-h3 font-medium">Hours of {name}</h2>
        {groups.length > 0 && status.state !== "unknown" && (
          <p
            className={dsCn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-ds-label font-medium",
              status.state === "open" ? "border-ds-live/25 bg-ds-live/[0.07] text-ds-live" : "border-ds-line text-ds-ink-2",
            )}
          >
            <span aria-hidden="true" className={dsCn("h-2 w-2 rounded-full", status.state === "open" ? "bg-ds-live-dot" : "bg-ds-ink-3")} />
            {status.label}
          </p>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="mt-4 border-t border-ds-line pt-4 text-[1.0625rem] text-ds-ink-2 sm:text-ds-body">
          Hours are not set yet. Please call the clinic.
        </p>
      ) : (
        <dl className="mt-4 border-t border-ds-line">
          {groups.map((g) => {
            const isToday = g.days.includes(today);
            const sessions = g.sample.is_open ? dayIntervals(g.sample).map((i) => `${i.startLabel} – ${i.endLabel}`) : ["Closed"];
            const lines = sessions.length > 0 ? sessions : ["Contact the clinic"];
            return (
              <div
                key={g.days.join("-")}
                className={dsCn(
                  "flex items-start justify-between gap-4 border-b border-ds-line py-3.5 text-[1.0625rem] sm:text-ds-body",
                  isToday ? "font-semibold text-ds-ink" : "text-ds-ink-2",
                )}
              >
                <dt>
                  {formatDayRangeLabel(g.days, DAY_NAMES)}
                  {isToday && <span className="ml-2 text-ds-label font-medium text-ds-accent-ink">Today</span>}
                </dt>
                <dd className={dsCn("text-right ds-tabular", !g.sample.is_open && "text-ds-danger")}>
                  {lines.map((line) => (
                    <span key={line} className="block whitespace-nowrap">{line}</span>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
};

export default DoctorHours;
