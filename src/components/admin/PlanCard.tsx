import { Link } from "react-router-dom";
import { CalendarClock, SlidersHorizontal } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useCustomPlan } from "@/hooks/useCustomPlan";
import { Progress } from "@/components/ui/progress";
import { customPlanApplication } from "@/lib/customPlan";
import { summarizePlan } from "@/lib/planSummary";
import { formatIstDate } from "@/lib/istDate";

const BILLING_PERIOD_DAYS = 30;

// Dashboard card for a doctor on a paid plan (trial doctors have their own trial card):
// which plan, when it ends, how many days are left, and the custom plan if one applies.
const PlanCard = () => {
  const { profile, isStaff } = useProfile();
  const { customPlan } = useCustomPlan();
  if (isStaff || !profile) return null;

  const s = summarizePlan(profile);
  if (s.kind === "trial" || s.kind === "unknown") return null;

  const custom = customPlanApplication(customPlan, profile.plan_tier) === "applies" ? customPlan : null;
  const progress = s.daysLeft == null ? 0 : Math.min(100, Math.max(0, ((BILLING_PERIOD_DAYS - s.daysLeft) / BILLING_PERIOD_DAYS) * 100));
  const urgent = s.urgency === "critical" || s.urgency === "ended";

  return (
    <Link
      to="/admin/settings?tab=subscription"
      className="block bg-navy/45 backdrop-blur-sm border border-white/20 rounded-xl p-4 min-w-[220px] hover:bg-navy/55 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-spark-bright" aria-hidden="true" />
        <span className="text-sm font-semibold text-white">
          {s.kind === "suspended" || s.kind === "expired" ? s.chip : `${s.tierLabel} plan`}
        </span>
      </div>

      {s.kind === "paid" && s.endsAt && (
        <>
          <Progress value={progress} className="h-2 bg-white/20 mb-2 [&>div]:bg-spark" />
          <p className="text-xs text-white/80">
            <span className={`font-bold tabular-nums ${urgent ? "text-spark-bright" : "text-white"}`}>
              {s.endsToday ? "Ends today" : `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`}
            </span>
            {" · ends "}{formatIstDate(s.endsAt)}
          </p>
        </>
      )}
      {s.kind === "paid" && !s.endsAt && <p className="text-xs text-white/80">Active · no end date</p>}
      {(s.kind === "expired" || s.kind === "suspended") && <p className="text-xs text-spark-bright font-semibold">{s.detail}</p>}
      <span className="sr-only">Opens subscription settings.</span>

      {custom && (
        <p className="text-[11px] text-white/80 mt-2 flex items-center gap-1">
          <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden="true" />
          Custom plan ₹{custom.monthly_price}/month{custom.valid_until ? ` until ${formatIstDate(custom.valid_until)}` : ""}
        </p>
      )}
    </Link>
  );
};

export default PlanCard;
