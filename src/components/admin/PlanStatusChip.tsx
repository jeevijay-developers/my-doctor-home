import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, CreditCard, AlertTriangle } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { summarizePlan, type PlanUrgency } from "@/lib/planSummary";

const TONE: Record<PlanUrgency, string> = {
  ok: "bg-secondary text-foreground border-border",
  soon: "bg-warning/10 text-warning border-warning/40",
  critical: "bg-destructive/10 text-destructive border-destructive/40",
  ended: "bg-destructive/10 text-destructive border-destructive/40",
};

// Always-visible "what plan am I on and when does it end", in the admin header, so a doctor
// never has to open Settings to find out. Staff don't see billing details, so they don't get it.
const PlanStatusChip = () => {
  const { profile, isStaff } = useProfile();
  // Re-evaluate every minute so a chip left open past midnight or past the end date stays true.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (isStaff || !profile) return null;
  const s = summarizePlan(profile, now);
  if (s.kind === "unknown") return null;

  const Icon = s.urgency === "ok" ? CreditCard : s.kind === "trial" ? Clock : AlertTriangle;
  return (
    <Link
      to="/admin/settings?tab=subscription"
      title={s.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 h-8 text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TONE[s.urgency]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="max-sm:hidden">{s.chip}</span>
      <span className="sm:hidden">{s.short}</span>
      <span className="sr-only">. {s.detail} Opens subscription settings.</span>
    </Link>
  );
};

export default PlanStatusChip;
