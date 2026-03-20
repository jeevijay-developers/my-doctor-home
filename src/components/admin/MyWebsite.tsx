import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Globe, ExternalLink, Copy, Monitor, Smartphone, Tablet, Save, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";

type Service = { id?: string; name: string; description: string; price: number; type: string; duration: number; active: boolean; sort_order: number };
type Package = { id?: string; name: string; tagline: string; price: number; original_price: number; duration: string; features: string[]; is_popular: boolean; active: boolean };
type WebSettings = Record<string, any>;

const MyWebsite = () => {
  const { profile } = useProfile();
  const [settings, setSettings] = useState<WebSettings>({});
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [settingsRes, servicesRes, packagesRes] = await Promise.all([
      supabase.from("website_settings").select("*").eq("doctor_id", profile.id).single(),
      supabase.from("services").select("*").eq("doctor_id", profile.id).order("sort_order"),
      supabase.from("packages").select("*").eq("doctor_id", profile.id).order("sort_order"),
    ]);
    if (settingsRes.data) setSettings(settingsRes.data);
    setServices((servicesRes.data || []).map((s: any) => ({ ...s, description: s.description || "" })));
    setPackages((packagesRes.data || []).map((p: any) => ({
      ...p, tagline: p.tagline || "", original_price: p.original_price || 0,
      features: Array.isArray(p.features) ? p.features : [],
    })));
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // Auto-save every 30s
  useEffect(() => {
    const interval = setInterval(() => { if (profile && settings.id) saveAll(true); }, 30000);
    return () => clearInterval(interval);
  }, [profile, settings, services, packages]);

  const saveAll = async (silent = false) => {
    if (!profile) return;
    setSaving(true);

    // Save settings
    const { id, doctor_id, created_at, updated_at, ...settingsData } = settings;
    await supabase.from("website_settings").update(settingsData).eq("doctor_id", profile.id);

    // Save services — upsert existing, insert new
    for (const s of services) {
      if (s.id) {
        await supabase.from("services").update({ name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order }).eq("id", s.id);
      } else {
        await supabase.from("services").insert({ doctor_id: profile.id, name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order });
      }
    }

    // Save packages
    for (const p of packages) {
      if (p.id) {
        await supabase.from("packages").update({ name: p.name, tagline: p.tagline, price: p.price, original_price: p.original_price || null, duration: p.duration, features: p.features as any, is_popular: p.is_popular, active: p.active }).eq("id", p.id);
      } else {
        await supabase.from("packages").insert({ doctor_id: profile.id, name: p.name, tagline: p.tagline, price: p.price, original_price: p.original_price || null, duration: p.duration, features: p.features as any, is_popular: p.is_popular, active: p.active });
      }
    }

    setSaving(false);
    setLastSaved(new Date());
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

  const addPackage = () => setPackages([...packages, { name: "", tagline: "", price: 1000, original_price: 0, duration: "1 Month", features: [], is_popular: false, active: true }]);
  const removePackage = async (idx: number) => {
    const p = packages[idx];
    if (p.id) await supabase.from("packages").delete().eq("id", p.id);
    setPackages(packages.filter((_, i) => i !== idx));
  };
  const updatePackage = (idx: number, key: string, value: any) => {
    const updated = [...packages];
    (updated[idx] as any)[key] = value;
    setPackages(updated);
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
                <p className="text-xs text-muted-foreground">About info is managed from Settings → Profile.</p>
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
                      <div><Label className="text-xs">Price ₹</Label><Input type="number" value={s.price} onChange={(e) => updateService(i, "price", Number(e.target.value))} /></div>
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={s.type} onValueChange={(v) => updateService(i, "type", v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="clinic">Clinic</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Duration</Label><Input type="number" value={s.duration} onChange={(e) => updateService(i, "duration", Number(e.target.value))} /></div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addService}><Plus className="h-3 w-3 mr-1" /> Add Service</Button>
              </AccordionContent>
            </AccordionItem>

            {/* Packages */}
            <AccordionItem value="packages" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Packages
                  <Switch checked={settings.show_packages ?? false} onCheckedChange={(v) => updateSetting("show_packages", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                {packages.map((p, i) => (
                  <div key={i} className="p-3 rounded-lg bg-secondary space-y-2">
                    <div className="flex items-center justify-between">
                      <Switch checked={p.is_popular} onCheckedChange={(v) => updatePackage(i, "is_popular", v)} />
                      <span className="text-xs text-muted-foreground">{p.is_popular ? "Most Popular" : "Mark Popular"}</span>
                      <button onClick={() => removePackage(i)}><Trash2 className="h-4 w-4 text-destructive" /></button>
                    </div>
                    <Input placeholder="Package name" value={p.name} onChange={(e) => updatePackage(i, "name", e.target.value)} />
                    <Input placeholder="Tagline" value={p.tagline} onChange={(e) => updatePackage(i, "tagline", e.target.value)} />
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-xs">Price ₹</Label><Input type="number" value={p.price} onChange={(e) => updatePackage(i, "price", Number(e.target.value))} /></div>
                      <div><Label className="text-xs">Original ₹</Label><Input type="number" value={p.original_price} onChange={(e) => updatePackage(i, "original_price", Number(e.target.value))} /></div>
                      <div>
                        <Label className="text-xs">Duration</Label>
                        <Select value={p.duration} onValueChange={(v) => updatePackage(i, "duration", v)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1 Month">1 Month</SelectItem>
                            <SelectItem value="3 Months">3 Months</SelectItem>
                            <SelectItem value="6 Months">6 Months</SelectItem>
                            <SelectItem value="1 Year">1 Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addPackage}><Plus className="h-3 w-3 mr-1" /> Add Package</Button>
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
                <p className="text-xs text-muted-foreground">Gallery photos can be managed from the gallery section. Upload up to 6 clinic photos.</p>
                <GalleryUploader doctorId={profile?.id} />
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
                <div className="grid grid-cols-2 gap-3">
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
              </AccordionContent>
            </AccordionItem>

            {/* Booking Settings */}
            <AccordionItem value="booking" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Booking Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Advance Booking (days)</Label>
                    <Select value={String(settings.booking_advance_days || 7)} onValueChange={(v) => updateSetting("booking_advance_days", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Max per Slot</Label><Input type="number" value={settings.max_per_slot || 1} onChange={(e) => updateSetting("max_per_slot", Number(e.target.value))} /></div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Online Payment</Label>
                  <Switch checked={settings.require_payment ?? false} onCheckedChange={(v) => updateSetting("require_payment", v)} />
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
                  Reviews
                  <Switch checked={settings.show_reviews ?? true} onCheckedChange={(v) => updateSetting("show_reviews", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-xs text-muted-foreground">Patient reviews will appear automatically. You can moderate them here.</p>
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
              <AccordionContent className="pb-4">
                <p className="text-xs text-muted-foreground">Blog posts will be managed in a dedicated Blog section (coming soon).</p>
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
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Facebook</Label><Input value={settings.social_facebook || ""} onChange={(e) => updateSetting("social_facebook", e.target.value)} placeholder="URL" /></div>
                  <div><Label>Instagram</Label><Input value={settings.social_instagram || ""} onChange={(e) => updateSetting("social_instagram", e.target.value)} placeholder="URL" /></div>
                  <div><Label>YouTube</Label><Input value={settings.social_youtube || ""} onChange={(e) => updateSetting("social_youtube", e.target.value)} placeholder="URL" /></div>
                  <div><Label>LinkedIn</Label><Input value={settings.social_linkedin || ""} onChange={(e) => updateSetting("social_linkedin", e.target.value)} placeholder="URL" /></div>
                </div>
                <div><Label>Google Analytics ID</Label><Input value={settings.google_analytics_id || ""} onChange={(e) => updateSetting("google_analytics_id", e.target.value)} placeholder="G-XXXXXXXXXX" /></div>
                <div>
                  <Label>Color Theme</Label>
                  <div className="flex gap-2 mt-1">
                    {[
                      { name: "blue", color: "bg-royal" },
                      { name: "green", color: "bg-success" },
                      { name: "red", color: "bg-destructive" },
                      { name: "pink", color: "bg-[hsl(330,67%,52%)]" },
                      { name: "dark", color: "bg-primary" },
                    ].map((t) => (
                      <button key={t.name} onClick={() => updateSetting("theme", t.name)}
                        className={`w-8 h-8 rounded-full ${t.color} ${settings.theme === t.name ? "ring-2 ring-offset-2 ring-royal" : ""}`} />
                    ))}
                  </div>
                </div>
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
              <iframe src={previewUrl} className="w-full" style={{ height: "calc(100vh - 12rem)" }} title="Preview" />
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                Complete onboarding to see your website preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Gallery sub-component
const GalleryUploader = ({ doctorId }: { doctorId?: string }) => {
  const [photos, setPhotos] = useState<any[]>([]);

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

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {photos.map((p) => (
        <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden group">
          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
          <button onClick={() => remove(p.id)} className="absolute top-1 right-1 bg-destructive/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3 w-3" /></button>
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
