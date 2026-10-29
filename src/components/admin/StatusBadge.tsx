import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// `text-success` / `text-warning` / `text-destructive` already resolve to their readable ink tones
// (see textColor in tailwind.config.ts), so every status passes 4.5:1 on its tinted fill.
const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/25",
  completed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
  pending: "bg-warning/15 text-warning border-warning/35",
};
// Unknown statuses shouldn't masquerade as "pending".
const NEUTRAL_STYLE = "bg-muted text-muted-foreground border-border";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge = ({ status, className }: StatusBadgeProps) => (
  <Badge
    variant="outline"
    className={cn("text-xs font-semibold capitalize", STATUS_STYLES[status] ?? NEUTRAL_STYLE, className)}
  >
    {status.replace("_", " ")}
  </Badge>
);

export default StatusBadge;
