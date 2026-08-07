import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Globe, ExternalLink, Copy, Monitor, Smartphone, Tablet, Save, Plus, Trash2, GripVertical, Clock, Pin, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProfilePage from "@/components/admin/ProfilePage";
import { toast } from "@/hooks/use-toast";
import { Star } from "lucide-react";

type Service = { id?: string; name: string; description: string; price: number; type: string; duration: number; active: boolean; sort_order: number };

type WorkingHour = { id?: string; day_of_week: number; is_open: boolean; start_time: string | null; end_time: string | null; start_time_2: string | null; end_time_2: string | null };
type Review = { id: string; patient_name: string; rating: number; review_text: string | null; is_visible: boolean; is_pinned: boolean; created_at: string };
type WebSettings = Record<string, any>;

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MyWebsite = () => {
  const nav = useNavigate();
  const { profile } = useProfile();
  const [settings, setSettings] = useState<WebSettings>({});
  const [aboutOpen, setAboutOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const [settingsRes, servicesRes, hoursRes, reviewsRes] = await Promise.all([
      supabase.from("website_settings").select("*").eq("doctor_id", profile.id).single(),
      supabase.from("services").select("*").eq("doctor_id", profile.id).order("sort_order"),
      supabase.from("working_hours").select("*").eq("doctor_id", profile.id).order("day_of_week"),
      supabase.from("reviews").select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false }),
    ]);
    if (settingsRes.data) setSettings(settingsRes.data);
    setServices((servicesRes.data || []).map((s: any) => ({ ...s, description: s.description || "" })));
    setWorkingHours((hoursRes.data || []) as WorkingHour[]);
    setReviews((reviewsRes.data || []) as Review[]);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const saveAllRef = useCallback(() => {
    if (profile && settings.id) saveAll(true);
  }, [profile, settings, services, workingHours]);

  useEffect(() => {
    const interval = setInterval(saveAllRef, 30000);
    return () => clearInterval(interval);
  }, [saveAllRef]);

  const saveAll = async (silent = false) => {
    if (!profile) return;
    setSaving(true);

    const { id: _id, doctor_id: _did, created_at: _ca, updated_at: _ua, ...settingsData } = settings;
    await supabase.from("website_settings").update(settingsData as any).eq("doctor_id", profile.id);

    for (const s of services) {
      if (s.id) {
        await supabase.from("services").update({ name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order }).eq("id", s.id);
      } else {
        await supabase.from("services").insert({ doctor_id: profile.id, name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order });
      }
    }

    for (const wh of workingHours) {
      if (wh.id) {
        await supabase.from("working_hours").update({
          is_open: wh.is_open, start_time: wh.start_time, end_time: wh.end_time,
          start_time_2: wh.start_time_2, end_time_2: wh.end_time_2,
        }).eq("id", wh.id);
      }
    }

    setSaving(false);
    setLastSaved(new Date());
    setPreviewKey((k) => k + 1);
    if (!silent) toast({ title: "Changes saved!" });
    load();
  };

  const updateSetting = (key: string, value: any) => setSettings((prev) => ({ ...prev, [key]: value }));

  const addService = () => setServices([...services, { name: "", description: "", price: 500, type: "clinic", duration: 30, active: true, sort_order: services.length }]);
  const removeService = async (idx: number) => {
    const s = services[idx];
    if (s.id) await supabase.from("services").delete().eq("id", s.id);
    setServices(services.filter((_, i) => i !== idx));
  };
  const updateService = (idx: number, key: string, value: any) => {
    const updated = [...services];
    (updated[idx] as any)[key] = value;
    setServices(updated);
  };

  const updateWorkingHour = (dayIdx: number, key: string, value: any) => {
    const updated = [...workingHours];
    const idx = updated.findIndex((h) => h.day_of_week === dayIdx);
    if (idx >= 0) (updated[idx] as any)[key] = value;
    setWorkingHours(updated);
  };

  const toggleReviewVisibility = async (id: string, visible: boolean) => {
    await supabase.from("reviews").update({ is_visible: visible }).eq("id", id);
    setReviews(reviews.map((r) => r.id === id ? { ...r, is_visible: visible } : r));
    toast({ title: visible ? "Review shown" : "Review hidden" });
  };

  const toggleReviewPin = async (id: string, pinned: boolean) => {
    await supabase.from("reviews").update({ is_pinned: pinned }).eq("id", id);
    setReviews(reviews.map((r) => r.id === id ? { ...r, is_pinned: pinned } : r));
    toast({ title: pinned ? "Review pinned" : "Review unpinned" });
  };

  const previewUrl = profile?.slug ? `/dr/${profile.slug}` : "";
  const previewWidth = previewDevice === "desktop" ? "100%" : previewDevice === "tablet" ? "768px" : "375px";

  const copyUrl = () => {
    const url = `${window.location.origin}${previewUrl}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copied!" });
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-royal" />
          <h1 className="font-heading font-semibold text-primary">My Website</h1>
          <span className="text-xs px-2 py-0.5 rounded-pill bg-success/10 text-success font-medium">Live</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-secondary px-2 py-1 rounded hidden sm:inline">{previewUrl}</code>
          <Button size="sm" variant="ghost" onClick={copyUrl}><Copy className="h-3 w-3" /></Button>
          <div className="flex border border-border rounded-lg">
            <button onClick={() => setPreviewDevice("desktop")} className={`p-1.5 ${previewDevice === "desktop" ? "bg-secondary" : ""}`}><Monitor className="h-4 w-4" /></button>
            <button onClick={() => setPreviewDevice("tablet")} className={`p-1.5 ${previewDevice === "tablet" ? "bg-secondary" : ""}`}><Tablet className="h-4 w-4" /></button>
            <button onClick={() => setPreviewDevice("mobile")} className={`p-1.5 ${previewDevice === "mobile" ? "bg-secondary" : ""}`}><Smartphone className="h-4 w-4" /></button>
          </div>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3 mr-1" /> View</Button>
            </a>
          )}
          <Button size="sm" onClick={() => saveAll(false)} disabled={saving} className="bg-royal hover:bg-royal/90">
            <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Editor */}
        <div className="w-full lg:w-[38%] overflow-y-auto border-r border-border bg-card p-4">
          {lastSaved && <p className="text-xs text-muted-foreground mb-3">Last saved: {lastSaved.toLocaleTimeString()}</p>}

          <Accordion type="multiple" defaultValue={["hero", "services"]} className="space-y-2">
            {/* Hero Section */}
            <AccordionItem value="hero" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Hero Banner</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <p className="text-xs text-muted-foreground">Managed from Settings → Profile. Hero is always visible.</p>
              </AccordionContent>
            </AccordionItem>

            {/* Quick Stats */}
            <AccordionItem value="stats" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Quick Stats
                  <Switch checked={settings.show_quick_stats ?? true} onCheckedChange={(v) => updateSetting("show_quick_stats", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <p className="text-xs text-muted-foreground">Stats are pulled from your profile data.</p>
              </AccordionContent>
            </AccordionItem>

            {/* About */}
            <AccordionItem value="about" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  About
                  <Switch checked={settings.show_about ?? true} onCheckedChange={(v) => updateSetting("show_about", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <p className="text-xs text-muted-foreground">
                  Edit your name, specialization, qualifications, experience, phone, clinic and consultation fee. Changes reflect on your public website and Profile page.
                </p>
                <Button size="sm" onClick={() => setAboutOpen(true)}>Edit About / Profile</Button>
              </AccordionContent>
            </AccordionItem>

            {/* Services */}
            <AccordionItem value="services" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Services
                  <Switch checked={settings.show_services ?? true} onCheckedChange={(v) => updateSetting("show_services", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                {services.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-secondary space-y-2">
                    <div className="flex items-center justify-between">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <Switch checked={s.active} onCheckedChange={(v) => updateService(i, "active", v)} />
                        <button onClick={() => removeService(i)}><Trash2 className="h-4 w-4 text-destructive" /></button>
                      </div>
                    </div>
                    <Input placeholder="Service name" value={s.name} onChange={(e) => updateService(i, "name", e.target.value)} />
                    <Input placeholder="Description" value={s.description} onChange={(e) => updateService(i, "description", e.target.value)} />
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-xs">Price ₹</Label><Input type="number" placeholder="0" value={s.price || ""} onChange={(e) => updateService(i, "price", e.target.value === "" ? 0 : Number(e.target.value))} /></div>
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={s.type} onValueChange={(v) => updateService(i, "type", v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="clinic">Clinic</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Duration</Label><Input type="number" placeholder="0" value={s.duration || ""} onChange={(e) => updateService(i, "duration", e.target.value === "" ? 0 : Number(e.target.value))} /></div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addService}><Plus className="h-3 w-3 mr-1" /> Add Service</Button>
              </AccordionContent>
            </AccordionItem>

            {/* Gallery */}
            <AccordionItem value="gallery" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Gallery
                  <Switch checked={settings.show_gallery ?? false} onCheckedChange={(v) => updateSetting("show_gallery", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-xs text-muted-foreground mb-2">Upload up to 6 clinic photos with optional captions.</p>
                <GalleryUploader doctorId={profile?.id} />
              </AccordionContent>
            </AccordionItem>

            {/* Working Hours */}
            <AccordionItem value="hours" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Working Hours</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                {dayNames.map((day, idx) => {
                  const wh = workingHours.find((h) => h.day_of_week === idx);
                  if (!wh) return null;
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-secondary space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-primary">{day}</span>
                        <Switch checked={wh.is_open} onCheckedChange={(v) => updateWorkingHour(idx, "is_open", v)} />
                      </div>
                      {wh.is_open && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div><Label className="text-xs">Morning Start</Label><Input type="time" value={wh.start_time || ""} onChange={(e) => updateWorkingHour(idx, "start_time", e.target.value)} /></div>
                            <div><Label className="text-xs">Morning End</Label><Input type="time" value={wh.end_time || ""} onChange={(e) => updateWorkingHour(idx, "end_time", e.target.value)} /></div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div><Label className="text-xs">Evening Start</Label><Input type="time" value={wh.start_time_2 || ""} onChange={(e) => updateWorkingHour(idx, "start_time_2", e.target.value || null)} /></div>
                            <div><Label className="text-xs">Evening End</Label><Input type="time" value={wh.end_time_2 || ""} onChange={(e) => updateWorkingHour(idx, "end_time_2", e.target.value || null)} /></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>

            {/* Online Consultation */}
            <AccordionItem value="online" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Online Consultation
                  <Switch checked={settings.show_online_consultation ?? false} onCheckedChange={(v) => updateSetting("show_online_consultation", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Fee ₹</Label><Input type="number" value={settings.online_fee || 500} onChange={(e) => updateSetting("online_fee", Number(e.target.value))} /></div>
                  <div>
                    <Label>Duration</Label>
                    <Select value={String(settings.online_duration || 30)} onValueChange={(v) => updateSetting("online_duration", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="45">45 min</SelectItem>
                        <SelectItem value="60">60 min</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    Video Provider
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">Connected</span>
                  </Label>
                  <Select
                    value={settings.video_provider || "zoom"}
                    onValueChange={(v) => updateSetting("video_provider", v)}
                  >
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select Video Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">Zoom</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Video consultations are powered by Zoom. Unique meeting links will be generated automatically upon booking.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Booking Settings */}
            <AccordionItem value="booking" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Booking Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Advance Booking (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.booking_advance_days ?? 7}
                      onChange={(e) => updateSetting("booking_advance_days", e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-10"
                    />
                    <p className="text-[11px] text-muted-foreground">How far ahead patients can book (1–365 days).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Bookings per Slot</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={settings.max_per_slot ?? 1}
                      onChange={(e) => updateSetting("max_per_slot", e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-10"
                    />
                    <p className="text-[11px] text-muted-foreground">Number of patients allowed in the same time slot.</p>
                  </div>
                </div>
                <div>
                  <Label>Patient Cancel/Reschedule Cutoff (hours)</Label>
                  <Input type="number" min={0} value={(settings as any).cancellation_cutoff_hours ?? 2}
                    onChange={(e) => updateSetting("cancellation_cutoff_hours" as any, Number(e.target.value))} />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Patients can't cancel or reschedule within this many hours before their appointment.
                  </p>
                </div>
                <div className="hidden">{/* keeps grid closure below intact */}</div>
                <div className="flex items-center justify-between">
                  <Label>Require Online Payment</Label>
                  <Switch checked={settings.require_payment ?? false} onCheckedChange={(v) => updateSetting("require_payment", v)} />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    Payment Gateway
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Not connected yet</span>
                  </Label>
                  <Select value="razorpay" disabled>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Razorpay (Coming Soon)" /></SelectTrigger>
                    <SelectContent><SelectItem value="razorpay">Razorpay (Coming Soon)</SelectItem></SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Online payments will activate automatically once Razorpay keys are added by the Doctylia team.
                    Until then, all bookings will fall back to Pay at Clinic.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-Confirm Bookings</Label>
                  <Switch checked={settings.auto_confirm ?? true} onCheckedChange={(v) => updateSetting("auto_confirm", v)} />
                </div>
                <div>
                  <Label>Buffer Between Appointments (min)</Label>
                  <Select value={String(settings.buffer_minutes || 0)} onValueChange={(v) => updateSetting("buffer_minutes", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">None</SelectItem>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="10">10 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Reviews */}
            <AccordionItem value="reviews" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Reviews ({reviews.length})
                  <Switch checked={settings.show_reviews ?? true} onCheckedChange={(v) => updateSetting("show_reviews", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                {reviews.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No reviews yet. Reviews will appear here once patients submit them.</p>
                ) : reviews.map((r) => (
                  <div key={r.id} className={`p-3 rounded-lg space-y-2 ${r.is_visible ? "bg-secondary" : "bg-destructive/5 border border-destructive/20"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-primary block break-words">{r.patient_name}</span>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {[...Array(r.rating)].map((_, i) => <Star key={i} size={12} className="text-warning fill-warning" />)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" className={`h-7 px-2 ${r.is_pinned ? "text-royal" : "text-muted-foreground"}`}
                          onClick={() => toggleReviewPin(r.id, !r.is_pinned)} title={r.is_pinned ? "Unpin" : "Pin to top"}>
                          <Pin className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className={`h-7 px-2 ${r.is_visible ? "text-muted-foreground" : "text-destructive"}`}
                          onClick={() => toggleReviewVisibility(r.id, !r.is_visible)} title={r.is_visible ? "Visible — click to hide" : "Hidden — click to show"}>
                          {r.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    {r.review_text && <p className="text-xs text-muted-foreground line-clamp-3 break-words">{r.review_text}</p>}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      {r.is_pinned && <span className="text-royal font-medium">📌 Pinned</span>}
                      {!r.is_visible && <span className="text-destructive font-medium">Hidden</span>}
                    </div>
                  </div>
                ))}

              </AccordionContent>
            </AccordionItem>

            {/* Blog */}
            <AccordionItem value="blog" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Blog
                  <Switch checked={settings.show_blog ?? false} onCheckedChange={(v) => updateSetting("show_blog", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-2">
                <p className="text-xs text-muted-foreground">Manage your blog posts with AI-powered writing assistance.</p>
                <button onClick={() => nav("/admin/blog")} className="inline-flex items-center gap-1 text-sm text-royal hover:underline font-medium">
                  Open Blog Manager &rarr;
                </button>
              </AccordionContent>
            </AccordionItem>

            {/* Clinic Details */}
            <AccordionItem value="clinic" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Clinic Details
                  <Switch checked={settings.show_clinic_details ?? true} onCheckedChange={(v) => updateSetting("show_clinic_details", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-xs text-muted-foreground">Clinic address, map, and hours managed from Settings → Clinic Details.</p>
              </AccordionContent>
            </AccordionItem>

            {/* Website Settings */}
            <AccordionItem value="websettings" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Website Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div><Label>SEO Title</Label><Input value={settings.seo_title || ""} onChange={(e) => updateSetting("seo_title", e.target.value)} placeholder="Dr. Name — Specialization" /></div>
                <div><Label>SEO Description</Label><Textarea value={settings.seo_description || ""} onChange={(e) => updateSetting("seo_description", e.target.value)} rows={2} placeholder="Your page description for Google..." /></div>
                <div><Label>WhatsApp Number</Label><Input value={settings.whatsapp_number || ""} onChange={(e) => updateSetting("whatsapp_number", e.target.value)} placeholder="+919XXXXXXXX" /></div>
                <div><Label>WhatsApp Pre-fill Message</Label><Input value={settings.whatsapp_message || ""} onChange={(e) => updateSetting("whatsapp_message", e.target.value)} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Facebook</Label><Input value={settings.social_facebook || ""} onChange={(e) => updateSetting("social_facebook", e.target.value)} placeholder="URL" /></div>
                  <div><Label>Instagram</Label><Input value={settings.social_instagram || ""} onChange={(e) => updateSetting("social_instagram", e.target.value)} placeholder="URL" /></div>
                  <div><Label>YouTube</Label><Input value={settings.social_youtube || ""} onChange={(e) => updateSetting("social_youtube", e.target.value)} placeholder="URL" /></div>
                  <div><Label>LinkedIn</Label><Input value={settings.social_linkedin || ""} onChange={(e) => updateSetting("social_linkedin", e.target.value)} placeholder="URL" /></div>
                </div>
                <div><Label>Google Analytics ID</Label><Input value={settings.google_analytics_id || ""} onChange={(e) => updateSetting("google_analytics_id", e.target.value)} placeholder="G-XXXXXXXXXX" /></div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Right Preview */}
        <div className="hidden lg:flex flex-1 bg-secondary items-start justify-center p-6 overflow-auto">
          <div className="bg-card rounded-xl shadow-lg overflow-hidden transition-all duration-300" style={{ width: previewWidth, maxWidth: "100%" }}>
            <div className="bg-secondary px-4 py-2 flex items-center gap-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/40" />
                <div className="w-3 h-3 rounded-full bg-warning/40" />
                <div className="w-3 h-3 rounded-full bg-success/40" />
              </div>
              <div className="flex-1 text-center">
                <code className="text-xs text-muted-foreground">{previewUrl || "your-page.doctylia.com"}</code>
              </div>
            </div>
            {previewUrl ? (
              <iframe key={previewKey} src={previewUrl} className="w-full" style={{ height: "calc(100vh - 12rem)" }} title="Preview" />
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                Complete onboarding to see your website preview
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit About / Profile</DialogTitle>
          </DialogHeader>
          <ProfilePage />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Gallery sub-component with captions
const GalleryUploader = ({ doctorId }: { doctorId?: string }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    supabase.from("gallery_photos").select("*").eq("doctor_id", doctorId).order("sort_order").then(({ data }) => setPhotos(data || []));
  }, [doctorId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doctorId || photos.length >= 6) return;
    const ext = file.name.split(".").pop();
    const path = `${doctorId}/gallery/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file);
    if (error) { toast({ title: "Upload failed", variant: "destructive" }); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    await supabase.from("gallery_photos").insert({ doctor_id: doctorId, photo_url: publicUrl, sort_order: photos.length });
    const { data } = await supabase.from("gallery_photos").select("*").eq("doctor_id", doctorId).order("sort_order");
    setPhotos(data || []);
    toast({ title: "Photo uploaded" });
  };

  const remove = async (id: string) => {
    await supabase.from("gallery_photos").delete().eq("id", id);
    setPhotos(photos.filter((p) => p.id !== id));
  };

  const updateCaption = async (id: string, caption: string) => {
    await supabase.from("gallery_photos").update({ caption }).eq("id", id);
    setPhotos(photos.map((p) => p.id === id ? { ...p, caption } : p));
    setEditingCaption(null);
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <div key={p.id} className="space-y-1">
          <div className="relative aspect-square rounded-lg overflow-hidden group">
            <img src={p.photo_url} alt={p.caption || ""} className="w-full h-full object-cover" />
            <button onClick={() => remove(p.id)} className="absolute top-1 right-1 bg-destructive/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3 w-3" /></button>
          </div>
          {editingCaption === p.id ? (
            <Input
              autoFocus
              defaultValue={p.caption || ""}
              placeholder="Caption..."
              className="h-7 text-xs"
              onBlur={(e) => updateCaption(p.id, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateCaption(p.id, (e.target as HTMLInputElement).value)}
            />
          ) : (
            <button
              onClick={() => setEditingCaption(p.id)}
              className="text-xs text-muted-foreground hover:text-primary truncate w-full text-left"
            >
              {p.caption || "Add caption..."}
            </button>
          )}
        </div>
      ))}
      {photos.length < 6 && (
        <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-royal transition">
          <input type="file" accept="image/*" className="hidden" onChange={upload} />
          <Plus className="h-6 w-6 text-muted-foreground" />
        </label>
      )}
    </div>
  );
};

export default MyWebsite;
