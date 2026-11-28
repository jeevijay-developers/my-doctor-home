import { Clock } from "lucide-react";
import { formatNextAvailable, type NextSlot } from "@/lib/doctorSite/nextAvailableLabel";

/** "Next: Today 4:30 pm" for a doctor's card or picker row. Renders nothing when there is no usable slot. */
const NextAvailableChip = ({ slot, now }: { slot: NextSlot | null | undefined; now?: Date }) => {
  const label = formatNextAvailable(slot, now);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ds-accent-soft px-3 py-1 text-ds-small font-medium text-ds-accent-ink">
      <Clock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
      <span>Next: {label}</span>
    </span>
  );
};

export default NextAvailableChip;
