import { Badge } from "@/components/ui/badge";
import { usePractitioners } from "@/hooks/usePractitioners";

/** "Dr Asha Rao" whether the stored display name already starts with Dr / Dr. or not (never "Drake"). */
export const doctorChipName = (displayName: string) => `Dr ${displayName.replace(/^dr\.?\s+/i, "").trim()}`;

interface Props {
  /** Doctors who have seen the patient (practitioner_ids from patients_with_doctors). The view returns them in
   *  uuid order, so the order is made here: `lastId` first, then the rest in the clinic's doctor order. */
  ids: string[] | null | undefined;
  /** last_practitioner_id from patients_with_doctors: the doctor of the most recent visit. */
  lastId?: string | null;
  /** Chips shown before collapsing the rest into "+n". */
  max?: number;
  className?: string;
}

// Small "Dr X" chips for a patient row. Renders nothing for a single-doctor clinic, so those
// clinics look exactly as before.
/** Most recent doctor first, the rest in the clinic's doctor order (`order` = practitioner ids, primary first then sort_order). */
export function orderDoctorIds(ids: string[], lastId: string | null | undefined, order: string[]): string[] {
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const rest = ids.filter((id) => id !== lastId).sort((a, b) => rank(a) - rank(b));
  return lastId && ids.includes(lastId) ? [lastId, ...rest] : rest;
}

const PatientDoctorChips = ({ ids, lastId, max = 2, className }: Props) => {
  const { isMulti, byId, practitioners } = usePractitioners();
  if (!isMulti || !ids?.length) return null;
  const ordered = orderDoctorIds(ids, lastId, (practitioners ?? []).map((p) => p.id));
  const known = ordered.map((id) => byId(id)).filter((p): p is NonNullable<ReturnType<typeof byId>> => !!p);
  if (!known.length) return null;
  const shown = known.slice(0, max);
  const rest = known.slice(max);
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ""}`} data-testid="patient-doctor-chips">
      {shown.map((p) => (
        <Badge key={p.id} variant="outline" className="text-[10px] font-normal text-muted-foreground">{doctorChipName(p.display_name)}</Badge>
      ))}
      {rest.length > 0 && (
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground" title={rest.map((p) => doctorChipName(p.display_name)).join(", ")}>+{rest.length}</Badge>
      )}
    </div>
  );
};

export default PatientDoctorChips;
