import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { ArrowLeft, Mail, Phone, Cake, VenetianMask, CalendarClock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

import OverviewTab from "./medical-records/OverviewTab";
import MedicalHistoryTab from "./medical-records/MedicalHistoryTab";
import ConditionsTab from "./medical-records/ConditionsTab";
import MedicationsTab from "./medical-records/MedicationsTab";
import AllergiesTab from "./medical-records/AllergiesTab";
import VisitsTab from "./medical-records/VisitsTab";
import PrescriptionsTab from "./medical-records/PrescriptionsTab";
import DocumentsTab from "./medical-records/DocumentsTab";
import TimelineTab from "./medical-records/TimelineTab";

type Patient = {
  id: string; name: string; phone: string; email: string | null;
  age: number | null; gender: string | null; last_visit: string | null; total_visits: number;
};

const PatientMedicalRecord = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const load = async () => {
      if (!profile || !patientId) return;
      setLoading(true);
      const { data } = await supabase.from("patients").select("id, name, phone, email, age, gender, last_visit, total_visits").eq("id", patientId).eq("doctor_id", profile.id).maybeSingle();
      setPatient(data as Patient | null);
      setLoading(false);
    };
    load();
  }, [profile, patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-royal" />
      </div>
    );
  }

  if (!patient || !profile) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24">
        <p className="text-muted-foreground font-medium">Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/patients")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Patients
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" className="h-8 text-xs -ml-2" onClick={() => navigate("/admin/patients")}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Patients
      </Button>

      <div className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-xl font-bold text-teal flex-shrink-0">
          {patient.name?.charAt(0)?.toUpperCase() || "P"}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-xl text-primary">{patient.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Medical Record</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {patient.phone}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {patient.email || "—"}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Cake className="h-3.5 w-3.5" /> {patient.age ? `${patient.age} yrs` : "—"}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><VenetianMask className="h-3.5 w-3.5" /> {patient.gender || "—"}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Last visit: {patient.last_visit || "—"}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Activity className="h-3.5 w-3.5" /> {patient.total_visits} total visits</div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="bg-card border border-border h-auto flex-wrap justify-start p-1 gap-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">Medical History</TabsTrigger>
          <TabsTrigger value="conditions" className="text-xs sm:text-sm">Conditions</TabsTrigger>
          <TabsTrigger value="medications" className="text-xs sm:text-sm">Medications</TabsTrigger>
          <TabsTrigger value="allergies" className="text-xs sm:text-sm">Allergies</TabsTrigger>
          <TabsTrigger value="visits" className="text-xs sm:text-sm">Visits</TabsTrigger>
          <TabsTrigger value="prescriptions" className="text-xs sm:text-sm">Prescriptions</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs sm:text-sm">Reports/Documents</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs sm:text-sm">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab patientId={patient.id} refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="history"><MedicalHistoryTab patientId={patient.id} doctorId={profile.id} refreshKey={refreshKey} onChange={bump} /></TabsContent>
        <TabsContent value="conditions"><ConditionsTab patientId={patient.id} doctorId={profile.id} onChange={bump} /></TabsContent>
        <TabsContent value="medications"><MedicationsTab patientId={patient.id} doctorId={profile.id} onChange={bump} /></TabsContent>
        <TabsContent value="allergies"><AllergiesTab patientId={patient.id} doctorId={profile.id} onChange={bump} /></TabsContent>
        <TabsContent value="visits"><VisitsTab patientId={patient.id} doctorId={profile.id} patientPhone={patient.phone} onChange={bump} /></TabsContent>
        <TabsContent value="prescriptions"><PrescriptionsTab patientId={patient.id} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab patientId={patient.id} doctorId={profile.id} onChange={bump} /></TabsContent>
        <TabsContent value="timeline"><TimelineTab patientId={patient.id} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default PatientMedicalRecord;
