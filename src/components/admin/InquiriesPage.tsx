import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Mail, Phone, AtSign, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type PatientQuery = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: "new" | "read" | "responded";
  created_at: string;
};

const STATUS_STYLE: Record<PatientQuery["status"], string> = {
  new: "bg-royal/10 text-royal",
  read: "bg-warning/10 text-warning",
  responded: "bg-success/10 text-success",
};

const InquiriesPage = () => {
  const { profile, can } = useProfile();
  const [queries, setQueries] = useState<PatientQuery[]>([]);
  const [selected, setSelected] = useState<PatientQuery | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("patient_queries")
      .select("*")
      .eq("doctor_id", profile.id)
      .order("created_at", { ascending: false });
    setQueries((data || []) as PatientQuery[]);
  };

  useEffect(() => { load(); }, [profile]);

  const setStatus = async (id: string, status: PatientQuery["status"]) => {
    const { error } = await supabase.from("patient_queries").update({ status }).eq("id", id);
    if (error) { toast.error("Couldn't update status."); return; }
    setQueries((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    toast.success(status === "responded" ? "Marked as responded" : "Marked as read");
  };

  const openQuery = (q: PatientQuery) => {
    setSelected(q);
    if (q.status === "new" && can("inquiries.manage")) setStatus(q.id, "read");
  };

  const newCount = queries.filter((q) => q.status === "new").length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <Mail className="h-6 w-6 text-royal" /> Inquiries
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Messages submitted through your website's contact form</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: String(queries.length), color: "text-foreground", bg: "bg-secondary" },
          { label: "New", value: String(newCount), color: "text-royal", bg: "bg-royal/10" },
          { label: "Responded", value: String(queries.filter((q) => q.status === "responded").length), color: "text-success", bg: "bg-success/10" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <div className={`font-heading font-bold text-xl ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {queries.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <Mail className="h-12 w-12 text-royal/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No inquiries yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Messages from your website's contact form will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Table — tablet/desktop */}
          <Card className="hidden md:block border-border/60 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 border-b border-border">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">Submitted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => openQuery(q)}
                      className={`border-b border-border/60 last:border-0 transition-colors hover:bg-secondary/40 cursor-pointer ${
                        q.status === "new" ? "bg-royal/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                            {q.name?.charAt(0)?.toUpperCase() || "P"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{q.name}</div>
                            <div className="text-[11px] text-muted-foreground lg:hidden">
                              {new Date(q.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="space-y-0.5">
                          {q.phone && <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" /> {q.phone}</div>}
                          {q.email && <div className="flex items-center gap-1 text-xs"><AtSign className="h-3 w-3" /> {q.email}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        <p className="truncate">{q.message}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`text-[10px] capitalize ${STATUS_STYLE[q.status]}`}>{q.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {can("inquiries.manage") && q.status !== "responded" && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setStatus(q.id, "responded"); }} title="Mark as responded">
                              <CheckCheck className="h-4 w-4 text-success" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-2">
            {queries.map((q) => (
              <Card
                key={q.id}
                onClick={() => openQuery(q)}
                className={`border-border/60 shadow-none cursor-pointer transition-colors hover:bg-secondary/40 ${q.status === "new" ? "bg-royal/5" : ""}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                        {q.name?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{q.name}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] capitalize flex-shrink-0 ${STATUS_STYLE[q.status]}`}>{q.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{q.message}</p>
                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      {q.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {q.phone}</div>}
                      {q.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><AtSign className="h-3 w-3" /> {q.email}</div>}
                    </div>
                    {can("inquiries.manage") && q.status !== "responded" && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={(e) => { e.stopPropagation(); setStatus(q.id, "responded"); }} title="Mark as responded">
                        <CheckCheck className="h-4 w-4 text-success" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Inquiry detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-royal/10 flex items-center justify-center text-base font-bold text-royal flex-shrink-0">
                    {selected.name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{selected.name}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-1">
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-royal">
                    <Phone className="h-3.5 w-3.5" /> {selected.phone}
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-royal">
                    <AtSign className="h-3.5 w-3.5" /> {selected.email}
                  </a>
                )}
              </div>

              <p className="text-sm text-foreground whitespace-pre-wrap border-t border-border pt-3">{selected.message}</p>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Badge variant="secondary" className={`text-[10px] capitalize ${STATUS_STYLE[selected.status]}`}>{selected.status}</Badge>
                {can("inquiries.manage") && selected.status !== "responded" && (
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStatus(selected.id, "responded")}>
                    <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark as Responded
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InquiriesPage;
