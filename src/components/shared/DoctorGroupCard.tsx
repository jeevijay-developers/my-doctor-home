import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DoctorGroupCardProps {
  doctorName: string;
  clinicName: string | null;
  count: number;
  itemLabel: string;
  children: React.ReactNode;
}

const DoctorGroupCard = ({ doctorName, clinicName, count, itemLabel, children }: DoctorGroupCardProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex-row items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-secondary/40">
            <div>
              <CardTitle className="text-sm font-semibold">{doctorName}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {clinicName || "—"} · {count} {itemLabel}{count === 1 ? "" : "s"}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DoctorGroupCard;
