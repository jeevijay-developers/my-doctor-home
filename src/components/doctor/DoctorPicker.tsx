import { UserRound } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { practitionerFee } from "@/lib/practitioners/fee";
import { dsCn } from "./ui/dsCn";
import NextAvailableChip from "./NextAvailableChip";
import type { NextByDoctor } from "@/hooks/useNextAvailableByDoctor";
import { radioKeyDown } from "./ui/radioKeyDown";

type Props = {
  doctors: PublicPractitioner[];
  value: string | null;
  onChange: (id: string) => void;
  /** The clinic's consultation fee, shown for a doctor without one of their own. */
  clinicFee: unknown;
  /** Each doctor's next free slot; a doctor without one shows no chip. */
  nextAvailable?: NextByDoctor;
  now?: Date;
};

/** The booking widget's "Doctor" step: one large radio card per bookable doctor. */
const DoctorPicker = ({ doctors, value, onChange, clinicFee, nextAvailable, now }: Props) => (
  <div role="radiogroup" aria-label="Doctor" onKeyDown={radioKeyDown} className="grid gap-3 sm:grid-cols-2">
    {doctors.map((d, i) => {
      const on = d.id === value;
      const name = formatDoctorName(d.display_name);
      return (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={on}
          tabIndex={on || (!value && i === 0) ? 0 : -1}
          onClick={() => onChange(d.id)}
          className={dsCn(
            "flex min-h-[5.5rem] items-center gap-4 rounded-ds-md border p-4 text-left transition-[border-color,box-shadow,background-color] duration-ds-1",
            on
              ? "border-ds-accent bg-ds-accent-soft/60 shadow-[0_0_0_3px_rgb(var(--ds-accent)/0.12)]"
              : "border-ds-line bg-ds-surface hover:border-ds-ink/30",
          )}
        >
          {d.photo_url ? (
            <OptimizedImage src={d.photo_url} alt="" width={112} height={112} decoding="async" className="h-14 w-14 shrink-0 rounded-full object-cover object-top ring-2 ring-ds-surface" />
          ) : (
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ds-paper-2 text-ds-ink-2">
              <UserRound className="h-6 w-6" strokeWidth={1.75} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-ds-display text-[1.1875rem] font-medium leading-tight text-ds-ink">{name}</span>
            {d.specialization && <span className="mt-0.5 block text-ds-body text-ds-ink-2">{d.specialization}</span>}
            <span className="mt-1 block text-ds-body font-semibold text-ds-ink ds-tabular">₹{practitionerFee(d, clinicFee)}</span>
            {nextAvailable?.[d.id] && (
              <span className="mt-1.5 block">
                <NextAvailableChip slot={nextAvailable[d.id]} now={now} />
              </span>
            )}
          </span>
        </button>
      );
    })}
  </div>
);

export default DoctorPicker;
