import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "teal" | "navy" | "warning";

// Tonal, brand-led palette (no rainbow): light tint fill, icon in the readable text tone.
const TONES: Record<StatTone, { tile: string; icon: string }> = {
  primary: { tile: "bg-primary/10", icon: "text-primary" },
  teal: { tile: "bg-teal/15", icon: "text-teal" },
  navy: { tile: "bg-navy/10 dark:bg-white/10", icon: "text-navy dark:text-foreground" },
  warning: { tile: "bg-warning/15", icon: "text-warning" },
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  to: string;
  tone?: StatTone;
}

const StatCard = ({ icon: Icon, label, value, sub, to, tone = "primary" }: StatCardProps) => (
  <Link to={to} aria-label={`${label}: ${value}, ${sub}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
    <Card className="rounded-2xl hover:border-primary/40 hover:shadow-md transition-[border-color,box-shadow] duration-200 cursor-pointer h-full">
      <CardContent className="p-4 pt-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", TONES[tone].tile)}>
            <Icon className={cn("h-[18px] w-[18px]", TONES[tone].icon)} aria-hidden="true" />
          </div>
          {/* min-w-0 lets the unbreakable all-caps label shrink/truncate instead of widening the card */}
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate min-w-0">{label}</div>
        </div>
        <div className="font-heading font-bold text-2xl text-foreground leading-tight tabular-nums truncate">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>
      </CardContent>
    </Card>
  </Link>
);

export default StatCard;
