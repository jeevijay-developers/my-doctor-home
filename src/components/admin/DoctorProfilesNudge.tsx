import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserRoundCheck, X } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import { dismissProfileNudge, doctorsNeedingProfileWork, isProfileNudgeDismissed } from "@/lib/profileCompleteness";

const MAX_NAMES = 5;

// Dashboard nudge for the clinic owner (or staff allowed to view doctors): in a 2+ doctor clinic, lists
// the doctors whose public page is not indexable yet or whose profile is under 60%. Dismissed per clinic
// in this browser. Renders nothing for single-doctor clinics and for doctor logins.
const DoctorProfilesNudge = () => {
  const { profile, isStaff, role, can } = useProfile();
  const { isMulti, active } = usePractitioners();
  const clinicId = profile?.id ?? null;
  const [dismissed, setDismissed] = useState(() => (clinicId ? isProfileNudgeDismissed(clinicId) : false));
  useEffect(() => { if (clinicId) setDismissed(isProfileNudgeDismissed(clinicId)); }, [clinicId]);

  const allowed = role !== "doctor" && (!isStaff || !!can?.("practitioners.view"));
  if (!clinicId || !allowed || !isMulti || dismissed) return null;
  const needing = doctorsNeedingProfileWork(active ?? []);
  if (needing.length === 0) return null;

  const names = needing.slice(0, MAX_NAMES).map((p) => p.display_name);
  const extra = needing.length - names.length;

  return (
    <div role="region" aria-label="Doctor profiles" className="relative rounded-xl border border-warning/30 bg-warning/10 p-4 pr-12">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <UserRoundCheck className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Complete your doctors' profiles</p>
          <p className="text-xs text-muted-foreground break-words">
            A doctor page needs a bio of at least 60 characters to appear in Google. Still to finish: {names.join(", ")}
            {extra > 0 ? ` and ${extra} more` : ""}.
          </p>
        </div>
        <Link to="/admin/doctors" className="text-sm font-medium text-royal hover:underline shrink-0">Open Doctors</Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss doctor profiles reminder"
        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60"
        onClick={() => { dismissProfileNudge(clinicId); setDismissed(true); }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default DoctorProfilesNudge;
