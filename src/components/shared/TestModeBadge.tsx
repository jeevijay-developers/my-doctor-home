import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Shown wherever mock payment mode could otherwise be mistaken for a real
// transaction — patient booking flow, doctor Bank/UPI Setup, Super Admin
// Payments & Payouts (mock-payment-mode-testing-prompt.md, "Important").
const TestModeBadge = ({ className }: { className?: string }) => (
  <Badge
    variant="outline"
    className={cn("gap-1 text-[10px] font-bold uppercase tracking-wide bg-warning/10 text-warning border-warning/30", className)}
  >
    <FlaskConical className="h-3 w-3" /> Test Mode
  </Badge>
);

export default TestModeBadge;
