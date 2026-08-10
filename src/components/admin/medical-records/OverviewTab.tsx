// Quick-glance snapshot of the whole medical record, grouped as sub-cards
// inside one "Overview" parent card so the doctor can scan everything
// without switching tabs. Each sub-card summarizes the SAME data as its
// full tab elsewhere in Patient Medical Record — nothing here is a separate
// or duplicate data source. Every sub-card is itself a shortcut: clicking
// anywhere on it (not just the title/icon) switches the parent Tabs to that
// section's own existing tab — the same TabsList stays visible throughout,
// so getting back to Overview is always just one click away.
import { useEffect, useState } from "react";
import {
  AlertTriangle, Stethoscope, Pill, CalendarClock, FileText, History, Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Row = Record<string, unknown>;

const SubCard = ({ title, icon: Icon, iconClass, onClick, children }: {
  title: string; icon: typeof Stethoscope; iconClass: string; onClick?: () => void; children: React.ReactNode;
}) => (
  <Card
    className={`border-border/60 shadow-none transition-all ${
      onClick ? "cursor-pointer hover:border-royal/40 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-none" : ""
    }`}
    onClick={onClick}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
  >
    <CardContent className="p-4">
      <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${iconClass}`} /> {title}
      </h3>
      {children}
    </CardContent>
  </Card>
);

const OverviewTab = ({ patientId, refreshKey, onNavigate }: {
  patientId: string; refreshKey: number; onNavigate?: (tab: string) => void;
}) => {
  const [allergies, setAllergies] = useState<Row[]>([]);
  const [conditions, setConditions] = useState<Row[]>([]);
  const [medications, setMedications] = useState<Row[]>([]);
  const [lastVisit, setLastVisit] = useState<Row | null>(null);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [recentEvents, setRecentEvents] = useState<{ label: string; date: string }[]>([]);
  const [reminder, setReminder] = useState<Row | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: al }, { data: co }, { data: me }, { data: vi }, { data: docs }, { data: rem }] = await Promise.all([
        supabase.from("patient_allergies").select("*").eq("patient_id", patientId).is("deleted_at", null).eq("is_active", true),
        supabase.from("patient_conditions").select("*").eq("patient_id", patientId).is("deleted_at", null).in("status", ["active", "under_treatment"]),
        supabase.from("patient_medications").select("*").eq("patient_id", patientId).is("deleted_at", null).eq("status", "active"),
        supabase.from("patient_visits").select("*").eq("patient_id", patientId).is("deleted_at", null).order("visit_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("patient_documents").select("id, document_name, document_date").eq("patient_id", patientId).is("deleted_at", null).order("document_date", { ascending: false }).limit(3),
        supabase.from("patient_checkup_reminders").select("next_checkup_date, frequency, status").eq("patient_id", patientId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setAllergies(al || []);
      setConditions(co || []);
      setMedications(me || []);
      setLastVisit(vi || null);
      setDocuments(docs || []);
      setReminder(rem || null);

      const events: { label: string; date: string }[] = [];
      if (vi) events.push({ label: "Visit logged", date: String(vi.visit_date) });
      for (const d of docs || []) events.push({ label: `Document uploaded — ${String(d.document_name)}`, date: String(d.document_date) });
      events.sort((a, b) => (a.date < b.date ? 1 : -1));
      setRecentEvents(events.slice(0, 3));
    };
    load();
  }, [patientId, refreshKey]);

  const go = (tab: string) => () => onNavigate?.(tab);

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-heading">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SubCard title="Medical History" icon={Stethoscope} iconClass="text-royal" onClick={go("history")}>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active conditions</p>
            ) : (
              <ul className="space-y-1.5">
                {conditions.map((c) => (
                  <li key={String(c.id)} className="text-sm text-foreground flex items-center justify-between gap-2">
                    <span>{String(c.condition_name)}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.status === "active" ? "Active" : "Under Treatment"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </SubCard>

          <SubCard title="Medications" icon={Pill} iconClass="text-teal" onClick={go("medications")}>
            {medications.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active medications</p>
            ) : (
              <ul className="space-y-1.5">
                {medications.map((m) => (
                  <li key={String(m.id)} className="text-sm text-foreground">
                    {String(m.medicine_name)}
                    {m.dosage ? <span className="text-muted-foreground"> · {String(m.dosage)}</span> : null}
                    {m.frequency ? <span className="text-muted-foreground"> · {String(m.frequency)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </SubCard>

          <SubCard title="Allergies" icon={AlertTriangle} iconClass="text-destructive" onClick={go("allergies")}>
            {allergies.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active allergies</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allergies.map((a) => (
                  <Badge key={String(a.id)} variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">
                    {String(a.allergy_name)}{a.reaction ? ` · ${String(a.reaction)}` : ""}
                  </Badge>
                ))}
              </div>
            )}
          </SubCard>

          <SubCard title="Visits" icon={CalendarClock} iconClass="text-warning" onClick={go("visits")}>
            {!lastVisit ? (
              <p className="text-xs text-muted-foreground">No visits logged yet</p>
            ) : (
              <div className="text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{String(lastVisit.visit_date)}</span>
                  {lastVisit.consultation_type ? <Badge variant="secondary" className="text-[10px]">{String(lastVisit.consultation_type)}</Badge> : null}
                </div>
                {lastVisit.diagnosis ? <p className="text-muted-foreground text-xs">Diagnosis: {String(lastVisit.diagnosis)}</p> : null}
                {lastVisit.reason_for_visit ? <p className="text-muted-foreground text-xs">Reason: {String(lastVisit.reason_for_visit)}</p> : null}
              </div>
            )}
          </SubCard>

          <SubCard title="Reports / Documents" icon={FileText} iconClass="text-ai-purple" onClick={go("documents")}>
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents available</p>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((d) => (
                  <li key={String(d.id)} className="text-sm text-foreground flex items-center justify-between gap-2">
                    <span className="truncate">{String(d.document_name)}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{String(d.document_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SubCard>

          <SubCard title="Timeline" icon={History} iconClass="text-royal" onClick={go("timeline")}>
            {recentEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent activity</p>
            ) : (
              <ul className="space-y-1.5">
                {recentEvents.map((e, i) => (
                  <li key={i} className="text-sm text-foreground flex items-center justify-between gap-2">
                    <span className="truncate">{e.label}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{e.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </SubCard>
        </div>

        <SubCard title="Checkup Reminder" icon={Bell} iconClass="text-royal" onClick={go("checkup-reminder")}>
          {reminder ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="text-muted-foreground">Next Checkup: </span>
                <span className="font-medium text-foreground">{String(reminder.next_checkup_date)}</span>
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {reminder.status === "active" ? "Active" : reminder.status === "paused" ? "Paused" : String(reminder.status)}
                </Badge>
              </div>
              {onNavigate && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onNavigate("checkup-reminder"); }}>
                  Manage
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {onNavigate && (
                <Button size="sm" className="h-8 text-xs bg-royal hover:bg-royal/90" onClick={(e) => { e.stopPropagation(); onNavigate("checkup-reminder"); }}>
                  Set Reminder
                </Button>
              )}
              <p className="text-xs text-muted-foreground">No upcoming reminders configured.</p>
            </div>
          )}
        </SubCard>
      </CardContent>
    </Card>
  );
};

export default OverviewTab;
