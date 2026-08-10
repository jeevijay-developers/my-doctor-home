// Read-only view of the patient's existing prescriptions (reuses the
// prescriptions table already used by PrescriptionsPage — no duplicate data).
// New prescriptions are still created from the main Prescriptions section.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Stethoscope, Pill, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Prescription = {
  id: string; diagnosis: string | null; medications: string | null; notes: string | null; date: string;
};

const PrescriptionsTab = ({ patientId }: { patientId: string }) => {
  const [rows, setRows] = useState<Prescription[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("prescriptions").select("id, diagnosis, medications, notes, date").eq("patient_id", patientId).order("date", { ascending: false });
      setRows((data || []) as Prescription[]);
    };
    load();
  }, [patientId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4.5 w-4.5 text-ai-purple" /> Prescriptions
          {rows.length > 0 && <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>}
        </h3>
        <Link to="/admin/prescriptions">
          <Button size="sm" variant="outline" className="h-8 text-xs">
            New Prescription <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <FileText className="h-9 w-9 mx-auto mb-2 opacity-20 text-ai-purple" />
            <p className="text-sm text-muted-foreground font-medium">No prescriptions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Prescriptions issued to this patient will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((rx) => (
            <Card key={rx.id} className="border-border/60 shadow-none">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground">{rx.diagnosis || "General consultation"}</span>
                  <Badge variant="secondary" className="text-[10px] bg-secondary">{rx.date}</Badge>
                </div>
                {rx.medications && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" /> <span className="whitespace-pre-line">{rx.medications}</span>
                  </p>
                )}
                {rx.notes && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0 mt-0.5" /> <span className="whitespace-pre-line">{rx.notes}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PrescriptionsTab;
