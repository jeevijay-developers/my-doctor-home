import { usePractitioners } from "@/hooks/usePractitioners";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const ALL_DOCTORS = "all";

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  /** Which doctors to list: every active one (default) or only those taking bookings. */
  options?: "active" | "bookable";
  /** Adds an "All doctors" item whose value is "all". */
  allowAll?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Doctors to leave out (e.g. the one being deactivated when picking where to move bookings). */
  excludeIds?: string[];
  /** Doctors to keep in the list even when `options` would hide them (e.g. an appointment's current doctor who is no longer bookable). */
  includeIds?: string[];
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

// The one doctor picker used across the admin panel. Renders nothing for a clinic that is
// not multi-doctor, so single-doctor clinics see exactly what they saw before.
const PractitionerSelect = ({
  value, onChange, options = "active", allowAll, required, disabled, excludeIds, includeIds, id, className,
  placeholder = "Choose a doctor", "aria-label": ariaLabel = "Doctor",
}: Props) => {
  const { isMulti, active, bookable, practitioners } = usePractitioners();
  if (!isMulti) return null;

  const list = (options === "bookable" ? bookable : active)
    .concat(includeIds ? practitioners.filter((p) => includeIds.includes(p.id) && !(options === "bookable" ? bookable : active).some((x) => x.id === p.id)) : [])
    .filter((p) => !excludeIds?.includes(p.id));

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled} required={required}>
      <SelectTrigger id={id} aria-label={ariaLabel} aria-required={required || undefined} className={cn("h-10", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL_DOCTORS}>All doctors</SelectItem>}
        {list.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.display_name}
            {p.specialization ? <span className="text-muted-foreground"> · {p.specialization}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default PractitionerSelect;
