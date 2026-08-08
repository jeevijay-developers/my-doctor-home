import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy } from "lucide-react";

const ContactSupportDialog = ({ trigger, defaultSubject }: { trigger?: React.ReactNode; defaultSubject?: string }) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("support_tickets").insert({
      doctor_id: user.id, subject, description, priority,
    });
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Support ticket raised", description: "Our team will get back to you soon." });
    setSubject(defaultSubject ?? ""); setDescription(""); setPriority("normal"); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="flex items-center gap-2 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent text-sm font-medium w-full px-2 py-1.5 rounded-lg transition-colors">
            <LifeBuoy className="h-4 w-4" /> <span>Contact Support</span>
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Contact Support</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
          </div>
          <Button onClick={submit} disabled={!subject.trim() || busy} className="w-full">{busy ? "Sending…" : "Send"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactSupportDialog;
