import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import { Globe, ExternalLink, Copy, Monitor, Smartphone, Tablet, Save, Plus, Trash2, GripVertical, Clock, Pin, EyeOff, Eye, UserCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProfilePage from "@/components/admin/ProfilePage";
import LockedFeatureCard from "@/components/admin/LockedFeatureCard";
import { toast } from "@/hooks/use-toast";
import { Star } from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { FEATURE_KEYS } from "@/lib/features";
import { DEFAULT_QUICK_STATS, AVAILABLE_STAT_ICONS, QuickStatItem } from "@/lib/quickStats";
import { buildDoctorMeta } from "@/lib/seo/doctorSeo";
import { SLOT_DURATION_OPTIONS, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/timeSlots";
import { PREVIEW_SETTINGS_MESSAGE, withoutPlatformDefaults } from "@/lib/doctorSite/heroSettings";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";

// `offeredBy` (multi-doctor clinics only): the doctors this service is limited to; [] = every doctor,
// undefined = not loaded (never written back).
type Service = { id?: string; name: string; description: string; price: number; type: string; duration: number; active: boolean; sort_order: number; offeredBy?: string[] };

type WorkingHour = { id?: string; day_of_week: number; is_open: boolean; start_time: string | null; end_time: string | null; start_time_2: string | null; end_time_2: string | null };
type Review = { id: string; patient_name: string; rating: number; review_text: string | null; is_visible: boolean; is_pinned: boolean; created_at: string; practitioner_id?: string | null };
type WebSettings = Record<string, any>;

const drName = (name: string) => `Dr. ${name.replace(/^dr\.?\s+/i, "")}`;
const idsKey = (ids: string[]) => [...ids].sort().join(",");
const SERVICE_MAPPING_ERRORS: Record<string, string> = {
  FORBIDDEN: "You don't have permission to change which doctors offer a service.",
  NOT_FOUND: "That service could not be found. Refresh and try again.",
  INVALID_PRACTITIONER: "One of the chosen doctors is not active in this clinic.",
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MyWebsite = () => {
  const nav = useNavigate();
  const { profile, isStaff, can } = useProfile();
  const { hasFeature, sourceOf, loading: featuresLoading } = useFeatureAccess();
  const isPremium = hasFeature(FEATURE_KEYS.ONLINE_CONSULTATION);
  // Working hours belong to a doctor (practitioner). This page edits the main doctor's;
  // in a multi-doctor clinic each doctor's hours live on the Doctors page instead.
  // Until the main doctor is known, hours load by clinic as they always did (in a
  // single-doctor clinic those are the same rows), so the grid never shows up empty.
  const { primary, isMulti, practitioners: allDoctors, active: activeDoctors } = usePractitioners();
  const activeList = activeDoctors ?? [];
  const isMultiRef = useRef(isMulti);
  isMultiRef.current = isMulti;
  // Saved "Offered by" per service id (as loaded / last saved), so only real changes are written.
  const savedOfferedRef = useRef<Record<string, string>>({});
  const mappingsLoadedRef = useRef(false);
  const [reviewDoctor, setReviewDoctor] = useState("all");
  const primaryId = primary?.id ?? null;
  const primaryIdRef = useRef(primaryId);
  primaryIdRef.current = primaryId;
  const hoursLoadedFor = useRef<string | null>(null);
  // This page is route-gated only on "View My Website" (website.view), so a
  // staff member with just that checkbox reaches it — but everything below
  // (services, hours, gallery, settings) writes through website.edit /
  // website.settings, and review pin/hide writes through reviews.manage
  // (see the staff_permission_policies migration). Without these, the editor
  // showed every control as if it were usable regardless of what the doctor
  // actually granted, and only silently failed at the RLS layer on save.
  const canEditWebsite = !isStaff || can("website.edit") || can("website.settings");
  const canManageReviews = !isStaff || can("reviews.manage");
  const [settings, setSettings] = useState<WebSettings>({});
  const [aboutOpen, setAboutOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const sendPreview = useCallback(() => {
    const frame = previewRef.current?.contentWindow;
    if (!frame || !profile?.slug) return;
    frame.postMessage({ type: PREVIEW_SETTINGS_MESSAGE, slug: profile.slug, settings }, window.location.origin);
  }, [settings, profile?.slug]);
  // Debounced so typing stays smooth; the preview updates a moment after each keystroke.
  useEffect(() => {
    const t = window.setTimeout(sendPreview, 150);
    return () => window.clearTimeout(t);
  }, [sendPreview]);

  const fetchHours = useCallback((clinicId: string) => {
    const pid = primaryIdRef.current;
    hoursLoadedFor.current = pid;
    let q = supabase.from("working_hours").select("*").eq("doctor_id", clinicId);
    if (pid) q = q.eq("practitioner_id", pid);
    return q.order("day_of_week");
  }, []);

  const offeredMap = (rows: { service_id: string; practitioner_id: string }[]) => {
    const m: Record<string, string[]> = {};
    for (const row of rows) (m[row.service_id] ??= []).push(row.practitioner_id);
    return m;
  };
  const recordSaved = (m: Record<string, string[]>) => {
    // A service absent from the map is "all doctors" (empty key).
    savedOfferedRef.current = Object.fromEntries(Object.entries(m).map(([id, ids]) => [id, idsKey(ids)]));
  };

  const load = useCallback(async () => {
    if (!profile) return;
    const multiNow = isMultiRef.current;
    const [settingsRes, servicesRes, hoursRes, reviewsRes, mappingRes] = await Promise.all([
      supabase.from("website_settings").select("*").eq("doctor_id", profile.id).single(),
      supabase.from("services").select("*").eq("doctor_id", profile.id).order("sort_order"),
      fetchHours(profile.id),
      supabase.from("reviews").select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false }),
      multiNow ? supabase.from("service_practitioners").select("service_id, practitioner_id").eq("doctor_id", profile.id) : Promise.resolve(null),
    ]);
    if (settingsRes.data) {
      let parsedStats = null;
      if (settingsRes.data.seo_keywords) {
        try {
          const parsed = JSON.parse(settingsRes.data.seo_keywords);
          if (Array.isArray(parsed) && parsed.length > 0) parsedStats = parsed;
        } catch (e) {
          // not JSON keywords
        }
      }
      // Pre-fill blank SEO fields with the same text the public page would generate, so the
      // doctor sees (and can refine) the real title/description instead of an empty box.
      const auto = buildDoctorMeta({
        origin: window.location.origin,
        profile,
        settings: { ...settingsRes.data, seo_title: "", seo_description: "" },
      });
      setSettings(withoutPlatformDefaults({
        ...settingsRes.data,
        seo_title: settingsRes.data.seo_title?.trim() ? settingsRes.data.seo_title : auto.title,
        seo_description: settingsRes.data.seo_description?.trim() ? settingsRes.data.seo_description : auto.description,
        quick_stats: parsedStats || DEFAULT_QUICK_STATS,
      }));
    }
    const mapping = mappingRes && !mappingRes.error ? offeredMap((mappingRes.data || []) as any[]) : null;
    if (mapping) { mappingsLoadedRef.current = true; recordSaved(mapping); }
    setServices((servicesRes.data || []).map((s: any) => ({
      ...s, description: s.description || "",
      ...(mapping ? { offeredBy: mapping[s.id] ?? [] } : {}),
    })));
    setWorkingHours((hoursRes.data || []) as WorkingHour[]);
    setReviews((reviewsRes.data || []) as Review[]);
  }, [profile, fetchHours]);

  useEffect(() => { load(); }, [load]);

  // The main doctor arrived after the first load: reload just the hours (not the whole
  // page, which would throw away unsaved edits elsewhere).
  useEffect(() => {
    if (!profile || !primaryId || hoursLoadedFor.current === primaryId) return;
    // Fewer than two doctors: the unfiltered clinic load already returned this doctor's rows, and a
    // late refetch could overwrite edits made since. Only a multi-doctor clinic needs the filter.
    if (!isMulti) { hoursLoadedFor.current = primaryId; return; }
    let cancelled = false;
    fetchHours(profile.id).then((res) => {
      if (!cancelled && !res.error) setWorkingHours((res.data || []) as WorkingHour[]);
    });
    return () => { cancelled = true; };
  }, [profile, primaryId, isMulti, fetchHours]);

  // The doctor list arrived after the page loaded: fetch the service mappings once and fill them in.
  useEffect(() => {
    if (!profile || !isMulti || mappingsLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      const res = await supabase.from("service_practitioners").select("service_id, practitioner_id").eq("doctor_id", profile.id);
      if (cancelled || res.error) return;
      const m = offeredMap((res.data || []) as any[]);
      mappingsLoadedRef.current = true;
      recordSaved(m);
      setServices((prev) => prev.map((s) => (s.offeredBy === undefined ? { ...s, offeredBy: s.id ? m[s.id] ?? [] : [] } : s)));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isMulti]);

  const lastFailureRef = useRef("");

  const saveAllRef = useCallback(() => {
    if (profile && settings.id) saveAll(true);
  }, [profile, settings, services, workingHours, isMulti]);

  useEffect(() => {
    const interval = setInterval(saveAllRef, 30000);
    return () => clearInterval(interval);
  }, [saveAllRef]);

  // Writes "Offered by" through the RPC, only when it differs from what was loaded or last saved.
  // Returns the reason it failed, or null when saved (or nothing to save).
  const saveOfferedBy = async (s: Service, serviceId: string | undefined): Promise<string | null> => {
    if (!serviceId || !s.offeredBy) return null;
    const key = idsKey(s.offeredBy);
    if ((savedOfferedRef.current[serviceId] ?? "") === key) return null;
    const active = activeList.map((d) => d.id);
    const chosen = s.offeredBy.filter((id) => active.includes(id));
    // Every active doctor selected is the same as "all doctors", which also covers doctors added later.
    const payload = chosen.length === active.length ? [] : chosen;
    const { data, error } = await supabase.rpc("set_service_practitioners" as any, { _service_id: serviceId, _practitioner_ids: payload } as any);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      const code = res?.error ?? error?.message;
      return (code && (SERVICE_MAPPING_ERRORS[code] ?? practitionerErrorMessage(code))) || "Please try again.";
    }
    savedOfferedRef.current[serviceId] = key;
    return null;
  };

  const saveAll = async (silent = false) => {
    if (!profile || !canEditWebsite) return;
    setSaving(true);
    try {
    for (const s of services) {
      if (s.price < 0) { toast({ title: "Invalid service price", description: `Price for "${s.name || 'service'}" cannot be negative.`, variant: "destructive" }); return; }
      if (s.duration < 1) { toast({ title: "Invalid service duration", description: `Duration for "${s.name || 'service'}" must be at least 1 minute.`, variant: "destructive" }); return; }
    }
    if (settings.online_fee != null && settings.online_fee < 0) {
      toast({ title: "Invalid fee", description: "Online consultation fee cannot be negative.", variant: "destructive" });
      return;
    }
    if (settings.booking_advance_days != null && (settings.booking_advance_days < 1 || settings.booking_advance_days > 365)) {
      toast({ title: "Invalid booking days", description: "Advance booking days must be between 1 and 365.", variant: "destructive" });
      return;
    }
    if (settings.cancellation_cutoff_hours != null && settings.cancellation_cutoff_hours < 0) {
      toast({ title: "Invalid cutoff hours", description: "Cancellation cutoff hours cannot be negative.", variant: "destructive" });
      return;
    }
    if (settings.slot_duration_minutes != null && !(SLOT_DURATION_OPTIONS as readonly number[]).includes(settings.slot_duration_minutes)) {
      toast({ title: "Invalid slot duration", description: "Choose a valid appointment slot duration.", variant: "destructive" });
      return;
    }

    const { id: _id, doctor_id: _did, created_at: _ca, updated_at: _ua, quick_stats, ...settingsData } = settings;
    if (quick_stats) {
      (settingsData as any).seo_keywords = JSON.stringify(quick_stats);
    }
    const { error: settingsError } = await supabase.from("website_settings").update(settingsData as any).eq("doctor_id", profile.id);
    if (settingsError) { toast({ title: "Save failed", description: settingsError.message, variant: "destructive" }); return; }

    // Every write below is checked. Anything that fails is reported once, the unsaved rows stay as the
    // owner left them, and the reload is skipped so a restriction or new service is never silently reverted.
    const failures: { what: string; detail: string }[] = [];
    const insertedIds = new Map<number, string>();
    for (const [idx, s] of services.entries()) {
      const label = s.name?.trim() || "a service";
      let newServiceId: string | undefined;
      if (s.id) {
        const { error } = await supabase.from("services").update({ name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order }).eq("id", s.id);
        if (error) { failures.push({ what: `"${label}"`, detail: error.message || "Please try again." }); continue; }
      } else {
        const row = { doctor_id: profile.id, name: s.name, description: s.description, price: s.price, type: s.type, duration: s.duration, active: s.active, sort_order: s.sort_order };
        if (isMulti) {
          // A multi-doctor clinic needs the new id to save which doctors offer the service.
          const ins: any = await supabase.from("services").insert(row).select("id").single();
          if (ins?.error || !ins?.data?.id) { failures.push({ what: `"${label}"`, detail: ins?.error?.message || "Please try again." }); continue; }
          newServiceId = ins.data.id;
          insertedIds.set(idx, ins.data.id);
        } else {
          const { error } = await supabase.from("services").insert(row);
          if (error) { failures.push({ what: `"${label}"`, detail: error.message || "Please try again." }); continue; }
        }
      }
      if (isMulti && s.offeredBy) {
        const mappingError = await saveOfferedBy(s, s.id ?? newServiceId);
        if (mappingError) failures.push({ what: `which doctors offer "${label}"`, detail: mappingError });
      }
    }
    if (insertedIds.size) {
      // Remember the ids of services that were created, so the next save updates them instead of adding copies.
      setServices((prev) => prev.map((row, i) => (!row.id && insertedIds.has(i) ? { ...row, id: insertedIds.get(i) } : row)));
    }
    if (failures.length) {
      const detail = Array.from(new Set(failures.map((f) => f.detail))).join(" ");
      const text = `${failures.map((f) => f.what).join(", ")}|${detail}`;
      if (!silent || text !== lastFailureRef.current) {
        toast({ title: `Could not save ${failures.map((f) => f.what).join(", ")}`, description: detail, variant: "destructive" });
      }
      lastFailureRef.current = text;
      return;
    }
    lastFailureRef.current = "";

    // In a multi-doctor clinic the grid is hidden and hours are edited on the Doctors
    // page; writing these (possibly stale) rows back on autosave would undo those edits.
    for (const wh of isMulti ? [] : workingHours) {
      if (wh.id) {
        await supabase.from("working_hours").update({
          is_open: wh.is_open, start_time: wh.start_time, end_time: wh.end_time,
          start_time_2: wh.start_time_2, end_time_2: wh.end_time_2,
        }).eq("id", wh.id);
      }
    }

    setLastSaved(new Date());
    if (!silent) {
      setPreviewKey((k) => k + 1);
      toast({ title: "Changes saved!" });
    }
    load();
    } finally {
      // Every early return (validation failures, save errors) must release the Save button.
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleHeroPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !canEditWebsite) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/hero-photo.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    // upsert reuses the same path, so bust the cache or the browser keeps showing the old image.
    updateSetting("hero_photo_url", `${publicUrl}?v=${Date.now()}`);
    toast({ title: "Hero photo uploaded — click Save to publish it" });
  };

  const handleAboutPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !canEditWebsite) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/about-photo.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    updateSetting("about_photo_url", `${publicUrl}?v=${Date.now()}`);
    toast({ title: "About photo uploaded — click Save to publish it" });
  };

  const addService = () => {
    if (!canEditWebsite) return;
    setServices([...services, { name: "", description: "", price: 500, type: "clinic", duration: 30, active: true, sort_order: services.length, ...(isMulti ? { offeredBy: [] } : {}) }]);
  };
  const removeService = async (idx: number) => {
    if (!canEditWebsite) return;
    const s = services[idx];
    if (s.id) await supabase.from("services").delete().eq("id", s.id);
    setServices(services.filter((_, i) => i !== idx));
  };
  const updateService = (idx: number, key: string, value: any) => {
    const updated = [...services];
    (updated[idx] as any)[key] = value;
    setServices(updated);
  };

  const quickStatsList: QuickStatItem[] =
    settings.quick_stats && Array.isArray(settings.quick_stats) && settings.quick_stats.length > 0
      ? settings.quick_stats
      : DEFAULT_QUICK_STATS;

  const updateStatItem = (idx: number, field: string, val: any) => {
    const updated = [...quickStatsList];
    updated[idx] = { ...updated[idx], [field]: val };
    updateSetting("quick_stats", updated);
  };

  const addStatItem = () => {
    const updated = [
      ...quickStatsList,
      { id: `custom_${Date.now()}`, label: "New Stat", value: "100+", icon: "Award", active: true },
    ];
    updateSetting("quick_stats", updated);
  };

  const removeStatItem = (idx: number) => {
    const updated = quickStatsList.filter((_, i) => i !== idx);
    updateSetting("quick_stats", updated);
  };

  const updateWorkingHour = (dayIdx: number, key: string, value: any) => {
    const updated = [...workingHours];
    const idx = updated.findIndex((h) => h.day_of_week === dayIdx);
    if (idx >= 0) (updated[idx] as any)[key] = value;
    setWorkingHours(updated);
  };

  const toggleReviewVisibility = async (id: string, visible: boolean) => {
    if (!canManageReviews) return;
    await supabase.from("reviews").update({ is_visible: visible }).eq("id", id);
    setReviews(reviews.map((r) => r.id === id ? { ...r, is_visible: visible } : r));
    toast({ title: visible ? "Review shown" : "Review hidden" });
  };

  const toggleReviewPin = async (id: string, pinned: boolean) => {
    if (!canManageReviews) return;
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
          {canEditWebsite && (
            <Button size="sm" onClick={() => saveAll(false)} disabled={saving} className="bg-royal hover:bg-royal/90">
              <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Editor */}
        <div className="w-full lg:w-[38%] overflow-y-auto border-r border-border bg-card p-4">
          {lastSaved && <p className="text-xs text-muted-foreground mb-3">Last saved: {lastSaved.toLocaleTimeString()}</p>}

          <Accordion type="multiple" defaultValue={[]} className="space-y-2">
            {/* Hero Section */}
            <AccordionItem value="hero" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Hero Banner</AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  The first thing patients see. Changes show in the preview as you type; Save to publish them. Leave a field empty to use the automatic text shown in grey.
                </p>

                <div>
                  <Label className="text-xs">Hero Photo</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="w-14 h-14 rounded-lg bg-secondary border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                      {settings.hero_photo_url ? (
                        <img
                          src={settings.hero_photo_url}
                          alt="Hero"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserCircle className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    {canEditWebsite && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-royal hover:underline cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={handleHeroPhotoUpload} />
                          {settings.hero_photo_url ? "Change Photo" : "Upload Photo"}
                        </label>
                        {settings.hero_photo_url && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline text-left"
                            onClick={() => updateSetting("hero_photo_url", null)}
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Only used in the hero banner. Your Profile photo is not used here.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Headline — Line 1</Label>
                    <Input
                      placeholder={profile?.full_name ? `Dr. ${profile.full_name}` : "Your name"}
                      value={settings.hero_headline_line1 ?? ""}
                      onChange={(e) => updateSetting("hero_headline_line1", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Headline — Line 2 (highlighted)</Label>
                    <Input
                      placeholder="e.g. for your whole family"
                      value={settings.hero_headline_line2 ?? ""}
                      onChange={(e) => updateSetting("hero_headline_line2", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                </div>
                <p className="-mt-2 text-[10px] text-muted-foreground">Empty: your name is the headline. Line 2 is shown in italics.</p>

                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder={`${profile?.specialization ? `${profile.specialization}${profile?.city ? ` in ${profile.city}` : ""}. ` : ""}Book a clinic visit online in under a minute, no phone call needed.`}
                    value={settings.hero_description ?? ""}
                    onChange={(e) => updateSetting("hero_description", e.target.value)}
                    rows={2}
                    disabled={!canEditWebsite}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Location Label</Label>
                    <Input
                      placeholder="The clinic"
                      value={settings.hero_location_label ?? ""}
                      onChange={(e) => updateSetting("hero_location_label", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hours Label</Label>
                    <Input
                      placeholder="Today"
                      value={settings.hero_hours_label ?? ""}
                      onChange={(e) => updateSetting("hero_hours_label", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <p className="sm:col-span-2 -mb-1 text-[10px] text-muted-foreground">Shown beside your clinic address and today's hours, under the hero text.</p>
                  <div>
                    <Label className="text-xs">Primary Button Label</Label>
                    <Input
                      placeholder="Book appointment"
                      value={settings.hero_primary_button_label ?? ""}
                      onChange={(e) => updateSetting("hero_primary_button_label", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Call Button Label</Label>
                    <Input
                      placeholder="Call <your number>"
                      value={settings.hero_secondary_button_label ?? ""}
                      onChange={(e) => updateSetting("hero_secondary_button_label", e.target.value)}
                      disabled={!canEditWebsite}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Only shown when a phone number is set in Profile.</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">"Get Directions" Link Label</Label>
                  <Input
                    placeholder="Get directions"
                    value={settings.hero_directions_label ?? ""}
                    onChange={(e) => updateSetting("hero_directions_label", e.target.value)}
                    disabled={!canEditWebsite}
                  />
                </div>

                <div className="p-3 rounded-lg bg-secondary space-y-2 border border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Photo badge (floats on your hero photo)</Label>
                    <Switch
                      checked={settings.show_hero_stat_badge ?? true}
                      onCheckedChange={(v) => updateSetting("show_hero_stat_badge", v)}
                      disabled={!canEditWebsite}
                    />
                  </div>
                  {(settings.show_hero_stat_badge ?? true) && (
                    <>
                      <Input
                        placeholder="Empty: shows your rating, or your years of experience"
                        value={settings.hero_stat_text ?? ""}
                        onChange={(e) => updateSetting("hero_stat_text", e.target.value)}
                        disabled={!canEditWebsite}
                      />
                      <Select
                        value={settings.hero_stat_icon || "Star"}
                        onValueChange={(v) => updateSetting("hero_stat_icon", v)}
                        disabled={!canEditWebsite}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_STAT_ICONS.map((ic) => (
                            <SelectItem key={ic.value} value={ic.value}>
                              <div className="flex items-center gap-2">
                                <ic.icon className="h-4 w-4 text-royal" />
                                <span>{ic.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
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
              <AccordionContent className="space-y-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  Customize the stat cards displayed below your website hero banner.
                </p>
                {quickStatsList.map((stat, i) => (
                  <div key={stat.id || i} className="p-3 rounded-lg bg-secondary space-y-3 border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold text-primary">
                          Stat #{i + 1} {stat.id === "experience" && "(Experience)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={stat.active !== false}
                          onCheckedChange={(v) => updateStatItem(i, "active", v)}
                          disabled={!canEditWebsite}
                        />
                        {canEditWebsite && (
                          <button onClick={() => removeStatItem(i)} title="Remove stat">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          placeholder="e.g. Patients Treated"
                          value={stat.label}
                          onChange={(e) => updateStatItem(i, "label", e.target.value)}
                          disabled={!canEditWebsite}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Value</Label>
                        <Input
                          placeholder={
                            stat.id === "experience"
                              ? `Default: ${profile?.experience_years || 0}+`
                              : "e.g. 5,000+"
                          }
                          value={stat.value}
                          onChange={(e) => updateStatItem(i, "value", e.target.value)}
                          disabled={!canEditWebsite}
                        />
                        {stat.id === "experience" && !stat.value && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Defaults to onboarding experience ({profile?.experience_years || 0}+). Type to override.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Icon</Label>
                      <Select
                        value={stat.icon || "Users"}
                        onValueChange={(v) => updateStatItem(i, "icon", v)}
                        disabled={!canEditWebsite}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_STAT_ICONS.map((ic) => (
                            <SelectItem key={ic.value} value={ic.value}>
                              <div className="flex items-center gap-2">
                                <ic.icon className="h-4 w-4 text-royal" />
                                <span>{ic.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                {canEditWebsite && (
                  <Button size="sm" variant="outline" onClick={addStatItem}>
                    <Plus className="h-3 w-3 mr-1" /> Add Quick Stat
                  </Button>
                )}
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
                <div>
                  <Label className="text-xs">About Photo</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="w-14 h-14 rounded-lg bg-secondary border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                      {settings.about_photo_url ? (
                        <img src={settings.about_photo_url} alt="About" className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    {canEditWebsite && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-royal hover:underline cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={handleAboutPhotoUpload} />
                          {settings.about_photo_url ? "Change Photo" : "Upload Photo"}
                        </label>
                        {settings.about_photo_url && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline text-left"
                            onClick={() => updateSetting("about_photo_url", null)}
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Only used in the About section. Your Profile photo is not used here.
                  </p>
                </div>
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
                        <Switch checked={s.active} onCheckedChange={(v) => updateService(i, "active", v)} disabled={!canEditWebsite} />
                        {canEditWebsite && (
                          <button onClick={() => removeService(i)}><Trash2 className="h-4 w-4 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                    <Input placeholder="Service name" value={s.name} onChange={(e) => updateService(i, "name", e.target.value)} />
                    <Input placeholder="Description" value={s.description} onChange={(e) => updateService(i, "description", e.target.value)} />
                    {isMulti && s.offeredBy && (
                      <div role="group" aria-label="Offered by" className="space-y-1">
                        <Label className="text-xs">Offered by</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const chip = "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60";
                            const on = "border-primary bg-primary text-primary-foreground";
                            const off = "border-input bg-background text-foreground hover:bg-accent";
                            const picked = s.offeredBy.filter((id) => activeList.some((d) => d.id === id));
                            // Mapped, but only to doctors who are no longer active: not the same as "all doctors".
                            const onlyInactive = s.offeredBy.length > 0 && picked.length === 0;
                            return (
                              <>
                                <button type="button" aria-pressed={picked.length === 0 && !onlyInactive} disabled={!canEditWebsite}
                                  className={`${chip} ${picked.length === 0 && !onlyInactive ? on : off}`}
                                  onClick={() => updateService(i, "offeredBy", [])}>All doctors</button>
                                {activeList.map((d) => {
                                  const sel = picked.includes(d.id);
                                  return (
                                    <button key={d.id} type="button" aria-pressed={sel} disabled={!canEditWebsite}
                                      className={`${chip} ${sel ? on : off}`}
                                      onClick={() => updateService(i, "offeredBy", sel ? picked.filter((x) => x !== d.id) : [...picked, d.id])}>
                                      {d.display_name}
                                    </button>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                        {s.offeredBy.length > 0 && !s.offeredBy.some((id) => activeList.some((d) => d.id === id)) && (
                          <p role="alert" className="text-xs text-warning">Only offered by doctors who are no longer active — patients can't book it.</p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={s.type} onValueChange={(v) => updateService(i, "type", v)} disabled={!canEditWebsite}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="clinic">Clinic</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Duration</Label><DigitsInput maxLength={3} placeholder="0" value={s.duration || ""} onChange={(e) => updateService(i, "duration", e.target.value === "" ? 0 : Number(e.target.value))} disabled={!canEditWebsite} /></div>
                      <div><Label className="text-xs">Price (₹)</Label><AmountInput placeholder="500" value={s.price ?? ""} onChange={(e) => updateService(i, "price", e.target.value === "" ? 0 : Number(e.target.value))} disabled={!canEditWebsite} /></div>
                    </div>
                  </div>
                ))}
                {canEditWebsite && (
                  <Button size="sm" variant="outline" onClick={addService}><Plus className="h-3 w-3 mr-1" /> Add Service</Button>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Gallery */}
            <AccordionItem value="gallery" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Gallery
                  <Switch checked={settings.show_gallery ?? false} onCheckedChange={(v) => updateSetting("show_gallery", v)} onClick={(e) => e.stopPropagation()} disabled={!canEditWebsite} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <p className="text-xs text-muted-foreground mb-2">Upload up to 6 clinic photos with optional captions.</p>
                <GalleryUploader doctorId={profile?.id} canEdit={canEditWebsite} />
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
                <div className="p-3 rounded-lg bg-secondary space-y-1.5">
                  <Label className="text-xs">Appointment Slot Duration</Label>
                  <Select
                    value={String(settings.slot_duration_minutes ?? DEFAULT_SLOT_DURATION_MINUTES)}
                    onValueChange={(v) => updateSetting("slot_duration_minutes", Number(v))}
                    disabled={!canEditWebsite}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SLOT_DURATION_OPTIONS.map((mins) => (
                        <SelectItem key={mins} value={String(mins)}>{mins} minutes</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    How far apart patient appointment slots are on your booking page.
                  </p>
                </div>
                {isMulti ? (
                  <p className="p-3 rounded-lg bg-secondary text-xs text-muted-foreground">
                    Each doctor's hours are set on the{" "}
                    <Link to="/admin/doctors" className="font-medium text-royal underline underline-offset-2">Doctors page</Link>.
                  </p>
                ) : dayNames.map((day, idx) => {
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
            {isPremium ? (
            <AccordionItem value="online" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">
                <div className="flex items-center justify-between w-full pr-2">
                  Online Consultation
                  <Switch checked={settings.show_online_consultation ?? false} onCheckedChange={(v) => updateSetting("show_online_consultation", v)} onClick={(e) => e.stopPropagation()} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Fee ₹</Label><AmountInput value={settings.online_fee || 500} onChange={(e) => updateSetting("online_fee", e.target.value === "" ? 0 : Number(e.target.value))} /></div>
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
            ) : featuresLoading ? (
              <div className="border rounded-xl px-4 py-3 text-sm text-muted-foreground">Checking your plan…</div>
            ) : (
              <div className="border rounded-xl px-4 py-3">
                <LockedFeatureCard
                  featureName="Online Consultation"
                  description="Video consultations via Zoom, with fee and duration settings. Available on Premium."
                  source={sourceOf(FEATURE_KEYS.ONLINE_CONSULTATION)}
                />
              </div>
            )}

            {/* Booking Settings */}
            <AccordionItem value="booking" className="border rounded-xl px-4">
              <AccordionTrigger className="text-sm font-semibold text-primary">Booking Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Advance Booking (days)</Label>
                    <DigitsInput
                      maxLength={3}
                      value={settings.booking_advance_days ?? 7}
                      onChange={(e) => updateSetting("booking_advance_days", e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-10"
                    />
                    <p className="text-[11px] text-muted-foreground">How far ahead patients can book (1–365 days).</p>
                  </div>
                </div>
                <div>
                  <Label>Patient Cancel/Reschedule Cutoff (hours)</Label>
                  <DigitsInput maxLength={3} value={(settings as any).cancellation_cutoff_hours ?? 2}
                    onChange={(e) => updateSetting("cancellation_cutoff_hours" as any, e.target.value === "" ? 0 : Number(e.target.value))} />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Patients can't cancel or reschedule within this many hours before their appointment.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Online Payment</Label>
                  <Switch checked={settings.require_payment ?? false} onCheckedChange={(v) => updateSetting("require_payment", v)} disabled={!canEditWebsite} />
                </div>
                {(!profile?.razorpay_payment_enabled || profile?.razorpay_account_status !== "active") && (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Razorpay Linked Account Not Active</span>
                    </div>
                    <p className="text-muted-foreground">
                      Live online payments require an active Razorpay Linked Account so consultation and service fees can be routed to your bank.
                    </p>
                    <button
                      type="button"
                      onClick={() => nav("/admin/settings")}
                      className="inline-flex items-center gap-1 font-medium text-royal hover:underline"
                    >
                      Configure Online Patient Payments in Settings &rarr;
                    </button>
                  </div>
                )}
                <div>
                  <Label className="flex items-center gap-2">
                    Payment Gateway
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${profile?.razorpay_payment_enabled && profile?.razorpay_account_status === "active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {profile?.razorpay_payment_enabled && profile?.razorpay_account_status === "active" ? "Active" : "Not connected yet"}
                    </span>
                  </Label>
                  <Select value="razorpay" disabled>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Razorpay Route" /></SelectTrigger>
                    <SelectContent><SelectItem value="razorpay">Razorpay Route</SelectItem></SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Patient payments are routed directly to your Razorpay Linked Account (settled T+2).
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
                {isMulti && reviews.length > 0 && (
                  <div>
                    <Label htmlFor="review-doctor-filter" className="text-xs">Doctor</Label>
                    <select id="review-doctor-filter" aria-label="Filter reviews by doctor" value={reviewDoctor}
                      onChange={(e) => setReviewDoctor(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      <option value="all">All doctors</option>
                      {(allDoctors ?? []).map((d) => <option key={d.id} value={d.id}>{drName(d.display_name)}</option>)}
                    </select>
                  </div>
                )}
                {reviews.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No reviews yet. Reviews will appear here once patients submit them.</p>
                ) : reviews.filter((r) => !isMulti || reviewDoctor === "all" || r.practitioner_id === reviewDoctor).map((r) => (
                  <div key={r.id} className={`p-3 rounded-lg space-y-2 ${r.is_visible ? "bg-secondary" : "bg-destructive/5 border border-destructive/20"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-primary block break-words">{r.patient_name}</span>
                        {isMulti && r.practitioner_id && (allDoctors ?? []).find((d) => d.id === r.practitioner_id) && (
                          <span className="mt-0.5 inline-block rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                            {drName((allDoctors ?? []).find((d) => d.id === r.practitioner_id)!.display_name)}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {[...Array(r.rating)].map((_, i) => <Star key={i} size={12} className="text-warning fill-warning" />)}
                        </div>
                      </div>
                      {canManageReviews && (
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
                      )}
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
                  <Switch checked={settings.show_blog ?? true} onCheckedChange={(v) => updateSetting("show_blog", v)} onClick={(e) => e.stopPropagation()} />
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
                <div><Label>SEO Title</Label><Input value={settings.seo_title || ""} onChange={(e) => updateSetting("seo_title", e.target.value)} maxLength={70} placeholder="Dr. Name — Specialization" /></div>
                <div><Label>SEO Description</Label><Textarea value={settings.seo_description || ""} onChange={(e) => updateSetting("seo_description", e.target.value)} rows={3} maxLength={160} placeholder="Your page description for Google..." />
                  <p className="mt-1 text-xs text-muted-foreground">Auto-filled from your profile — edit it to change how your site appears on Google.</p></div>
                <div><Label>WhatsApp Number</Label><FormattedPhoneInput value={settings.whatsapp_number || ""} onChange={(e) => updateSetting("whatsapp_number", e.target.value)} placeholder="+919XXXXXXXX" /></div>
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
              <iframe
                ref={previewRef}
                key={previewKey}
                src={previewUrl}
                // The site loads its data after the frame's load event; send now and again shortly after.
                onLoad={() => { sendPreview(); window.setTimeout(sendPreview, 1200); }}
                className="w-full"
                style={{ height: "calc(100vh - 12rem)" }}
                title="Preview"
              />
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
const GalleryUploader = ({ doctorId, canEdit }: { doctorId?: string; canEdit: boolean }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    supabase.from("gallery_photos").select("*").eq("doctor_id", doctorId).order("sort_order").then(({ data }) => setPhotos(data || []));
  }, [doctorId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doctorId || !canEdit || photos.length >= 6) return;
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
    if (!canEdit) return;
    await supabase.from("gallery_photos").delete().eq("id", id);
    setPhotos(photos.filter((p) => p.id !== id));
  };

  const updateCaption = async (id: string, caption: string) => {
    if (!canEdit) return;
    await supabase.from("gallery_photos").update({ caption }).eq("id", id);
    setPhotos(photos.map((p) => p.id === id ? { ...p, caption } : p));
    setEditingCaption(null);
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <div key={p.id} className="space-y-1">
          <div className="relative aspect-square rounded-lg overflow-hidden group border border-border/40">
            <img src={p.photo_url} alt={p.caption || ""} className="w-full h-full object-cover" />
            {canEdit && (
              <button onClick={() => remove(p.id)} className="absolute top-1 right-1 bg-destructive/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3 w-3" /></button>
            )}
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
              onClick={() => canEdit && setEditingCaption(p.id)}
              className="text-xs text-muted-foreground hover:text-primary truncate w-full text-left"
              disabled={!canEdit}
            >
              {p.caption || (canEdit ? "Add caption..." : "")}
            </button>
          )}
        </div>
      ))}
      {canEdit && photos.length < 6 && (
        <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-royal transition">
          <input type="file" accept="image/*" className="hidden" onChange={upload} />
          <Plus className="h-6 w-6 text-muted-foreground" />
        </label>
      )}
    </div>
  );
};

export default MyWebsite;
