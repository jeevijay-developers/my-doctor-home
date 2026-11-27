import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatIstDate } from "@/lib/istDate";
import {
  approvalLabel, platformLabel, postTypeLabel, publishingLabel, reportingLabel, type SocialMarketing,
} from "@/lib/socialMarketing";

// Read-only summary of the agreed social media marketing service. Shown to the clinic only while the
// service is active, so it never displays a scope that has not been confirmed. Every value is a React
// text node (the free-text fields are staff-written).
const SocialMarketingCard = ({ sm }: { sm: SocialMarketing }) => {
  const rows: [string, string][] = [
    ["Platforms", sm.platforms.map(platformLabel).join(", ")],
    ["Content", `${sm.posts_per_month} posts per month (${sm.post_types.map(postTypeLabel).join(", ")})`],
    ["Design and writing", sm.creative_included ? "Included" : "Not included"],
    ["Content calendar", sm.calendar_included ? "Included" : "Not included"],
    ["Publishing", publishingLabel(sm.publishing_by)],
    ["Community management", sm.community_management ? "Included" : "Not included"],
    ["Paid advertising", sm.paid_ads ? `Included. Ad spend about ₹${sm.ad_spend_monthly ?? 0} per month, paid by you` : "Not included"],
    ["Reports", reportingLabel(sm.reporting_frequency)],
    ["Your approval", approvalLabel(sm.approval_process)],
  ];
  return (
    <div className="rounded-xl border border-royal/30 bg-royal/5 p-4 space-y-3" data-testid="social-marketing-card">
      <div className="flex items-center gap-2 flex-wrap">
        <Megaphone className="h-4 w-4 text-royal" aria-hidden="true" />
        <span className="font-semibold text-sm text-foreground">Social media marketing</span>
        <Badge variant="outline" className="text-[10px]">₹{sm.monthly_fee}/month, billed separately by our team</Badge>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-muted-foreground shrink-0 w-36">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {sm.agreed_on && <p className="text-[11px] text-muted-foreground">Agreed on {formatIstDate(sm.agreed_on)}.</p>}
    </div>
  );
};

export default SocialMarketingCard;
