import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchDoctorBundle, fetchDoctorProfile, fetchPractitioners, takeDoctorPrefetch } from "@/lib/doctorSite/prefetch";
import { readPreviewMessage } from "@/lib/doctorSite/heroSettings";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { clinicHoursUnion } from "@/lib/practitioners/hours";

export type ServicePractitionerRow = { service_id: string; practitioner_id: string };

type DoctorData = {
  profile: any;
  services: any[];
  packages: any[];
  reviews: any[];
  gallery: any[];
  settings: any;
  /** When the clinic is open: the union of its doctors' hours (a single doctor's rows unchanged). */
  workingHours: any[];
  /** Every doctor's own rows (carry practitioner_id), limited to the doctors listed publicly. */
  allWorkingHours: any[];
  /** Every listed doctor's own rows, bookable or not (for a doctor's own page). */
  rawWorkingHours: any[];
  /** The clinic's publicly listed doctors; [] if the lookup failed. */
  practitioners: PublicPractitioner[];
  bookablePractitioners: PublicPractitioner[];
  /** The one bookable doctor of a clinic that lists two or more doctors; otherwise null. */
  soleBookable: PublicPractitioner | null;
  /** Which doctors offer which service. A service with no row here is offered by every doctor;
   *  [] when the lookup is unavailable (no filtering). */
  servicePractitioners: ServicePractitionerRow[];
  /** The doctor list could not be loaded (the page then works as a single-doctor site). */
  practitionersError: boolean;
  /** Reload the doctor list and working hours (e.g. after a booking was refused). */
  refreshPractitioners: () => Promise<void>;
  /** Two or more doctors can be booked online; otherwise the page behaves exactly as before. */
  isMultiDoctor: boolean;
  /**
   * Presentation only: the clinic lists two or more ACTIVE doctors (bookable or not), so the page
   * shows the clinic first instead of the owner. Differs from isMultiDoctor (booking), which needs
   * two BOOKABLE doctors. isMultiDoctor implies isTeamClinic, never the reverse.
   */
  isTeamClinic: boolean;
  isPremium: boolean;
  // Per-feature effective access (plan default + any active Superadmin
  // override) — e.g. hasFeature("online_consultation"). Falls back to false
  // for an unknown key or before the flags have loaded.
  hasFeature: (key: string) => boolean;
  loading: boolean;
};

const DoctorContext = createContext<DoctorData>({
  profile: null, services: [], packages: [], reviews: [], gallery: [],
  settings: {}, workingHours: [], allWorkingHours: [], rawWorkingHours: [], practitioners: [], bookablePractitioners: [],
  servicePractitioners: [], soleBookable: null, practitionersError: false, refreshPractitioners: async () => {},
  isMultiDoctor: false, isTeamClinic: false, isPremium: false, hasFeature: () => false, loading: true,
});

type ClinicShape = Pick<DoctorData, "workingHours" | "allWorkingHours" | "rawWorkingHours" | "practitioners" | "bookablePractitioners" | "soleBookable" | "isMultiDoctor" | "isTeamClinic">;

/** Everything derived from the doctor list and the raw working_hours rows. */
function deriveClinic(practitioners: PublicPractitioner[], rawHours: any[]): ClinicShape {
  const bookablePractitioners = practitioners.filter((p) => p.bookable);
  const isMultiDoctor = bookablePractitioners.length >= 2;
  const soleBookable = practitioners.length >= 2 && bookablePractitioners.length === 1 ? bookablePractitioners[0] : null;
  const idOf = (r: any) => (r as { practitioner_id?: string | null }).practitioner_id ?? "";
  // With no doctor list (lookup failed, older database) keep every row, so the hours never vanish.
  const listed = new Set(practitioners.map((p) => p.id));
  const rawWorkingHours = practitioners.length ? rawHours.filter((r) => listed.has(idOf(r))) : rawHours;
  // Without two bookable doctors the clinic is open only when a doctor who takes bookings is.
  const bookableIds = new Set(bookablePractitioners.map((p) => p.id));
  const allWorkingHours = !isMultiDoctor && bookablePractitioners.length > 0
    ? rawWorkingHours.filter((r) => bookableIds.has(idOf(r)))
    : rawWorkingHours;
  return {
    workingHours: clinicHoursUnion(allWorkingHours),
    allWorkingHours, rawWorkingHours, practitioners, bookablePractitioners, soleBookable, isMultiDoctor,
    isTeamClinic: practitioners.length >= 2,
  };
}

/** Best-effort: any failure means "no filtering" (every doctor offers every service); never blocks the page. */
async function fetchServicePractitioners(doctorId: string): Promise<ServicePractitionerRow[]> {
  try {
    const res = await supabase.rpc("get_public_service_practitioners" as any, { _doctor_id: doctorId } as any);
    if (res?.error) {
      console.error("get_public_service_practitioners failed", res.error);
      return [];
    }
    return (Array.isArray(res?.data) ? res.data : []) as ServicePractitionerRow[];
  } catch (e) {
    console.error("get_public_service_practitioners failed", e);
    return [];
  }
}

export const useDoctorData = () => useContext(DoctorContext);

export const DoctorProvider = ({ children }: { children: ReactNode }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<Omit<DoctorData, "hasFeature" | "refreshPractitioners">>({
    profile: null, services: [], packages: [], reviews: [], gallery: [],
    settings: {}, workingHours: [], allWorkingHours: [], rawWorkingHours: [], practitioners: [], bookablePractitioners: [],
    servicePractitioners: [], soleBookable: null, practitionersError: false,
    isMultiDoctor: false, isTeamClinic: false, isPremium: false, loading: true,
  });
  const clinicIdRef = useRef<string | null>(null);
  const rawHoursRef = useRef<any[]>([]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  // Only inside the My Website preview frame: the editor's unsaved settings, shown live.
  const [previewSettings, setPreviewSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      const next = readPreviewMessage(event, slug);
      if (next) setPreviewSettings(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [slug]);

  const refreshPractitioners = useCallback(async () => {
    const id = clinicIdRef.current;
    if (!id) return;
    const [pr, wh] = await Promise.all([
      fetchPractitioners(id),
      supabase.from("working_hours").select("*").eq("doctor_id", id).order("day_of_week"),
    ]);
    if (clinicIdRef.current !== id) return;
    if (pr.error) console.error("get_public_practitioners failed", pr.error);
    rawHoursRef.current = wh.data || [];
    setData((d) => ({ ...d, ...deriveClinic(pr.list, rawHoursRef.current), practitionersError: !!pr.error }));
    // Service mappings go with the doctor list (only meaningful with 2+ doctors).
    if (pr.list.length >= 2) {
      const rows = await fetchServicePractitioners(id);
      if (clinicIdRef.current === id) setData((d) => ({ ...d, servicePractitioners: rows }));
    }
  }, []);

  const hasFeature = useCallback((key: string) => featureFlags[key] ?? false, [featureFlags]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let featureChannel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadFeatureFlags = async (doctorId: string) => {
      const { data: flags } = await supabase.rpc("get_public_feature_flags", { _doctor_id: doctorId });
      if (cancelled) return;
      setFeatureFlags(Object.fromEntries((flags || []).map((f: any) => [f.feature_key, f.effective_enabled === true])));
    };

    const loadServiceMappings = (doctorId: string, list: PublicPractitioner[]) => {
      if (list.length < 2) return;
      fetchServicePractitioners(doctorId).then((rows) => {
        if (cancelled) return;
        setData((d) => ({ ...d, servicePractitioners: rows }));
      });
    };

    const load = async () => {
      // Started from main.tsx before this page's code arrived (same queries, same order).
      const pre = takeDoctorPrefetch(slug);
      const early = pre ? await pre.promise.catch(() => null) : null;
      const profile = early ? early.profile : await fetchDoctorProfile(slug);

      if (!profile) {
        // Try old-slug redirect
        const { data: historic } = await supabase
          .from("slug_history" as any)
          .select("doctor_id")
          .eq("old_slug", slug)
          .maybeSingle();

        if (historic && (historic as any).doctor_id) {
          const { data: current } = await supabase
            .from("profiles").select("slug")
            .eq("id", (historic as any).doctor_id)
            .maybeSingle();
          if (current?.slug && !cancelled) {
            const rest = location.pathname.replace(`/dr/${slug}`, "");
            navigate(`/dr/${current.slug}${rest}${location.search}`, { replace: true });
            return;
          }
        }
        if (!cancelled) setData((d) => ({ ...d, loading: false }));
        return;
      }

      const id = profile.id;
      const [servRes, pkgRes, revRes, galRes, setRes, whRes, premiumRes, practRes] = early?.bundle ?? (await fetchDoctorBundle(id));

      if (cancelled) return;
      clinicIdRef.current = id;
      rawHoursRef.current = whRes.data || [];
      setData({
        profile,
        services: servRes.data || [],
        packages: pkgRes.data || [],
        reviews: revRes.data || [],
        gallery: galRes.data || [],
        settings: setRes.data || {},
        ...deriveClinic(practRes.list, whRes.data || []),
        servicePractitioners: [],
        practitionersError: false,
        isPremium: premiumRes.data === true,
        loading: false,
      });

      // Per-service doctor mappings only matter with 2+ doctors; loaded after first paint, never gating it.
      loadServiceMappings(id, practRes.list);

      // One quiet retry after a second; the page already works as a single-doctor site meanwhile.
      if (practRes.error) {
        retryTimer = setTimeout(async () => {
          const again = await fetchPractitioners(id);
          if (cancelled) return;
          if (again.error) {
            console.error("get_public_practitioners failed", again.error);
            setData((d) => ({ ...d, practitionersError: true }));
          } else {
            setData((d) => ({ ...d, ...deriveClinic(again.list, rawHoursRef.current), practitionersError: false }));
            loadServiceMappings(id, again.list);
          }
        }, 1000);
      }

      await loadFeatureFlags(id);
      featureChannel = supabase
        .channel(`doctor-feature-overrides-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "doctor_feature_overrides", filter: `doctor_id=eq.${id}` },
          () => loadFeatureFlags(id)
        )
        .subscribe();
    };

    load();

    // Realtime: reflect doctor profile edits (name, photo, slug, etc.) instantly.
    const channel = supabase
      .channel(`doctor-public-${slug}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload: any) => {
          const updated = payload.new;
          if (!updated) return;
          setData((d) => {
            if (!d.profile || d.profile.id !== updated.id) return d;
            // Slug changed: navigate to the new URL so the address bar stays correct.
            if (updated.slug && updated.slug !== slug) {
              const rest = location.pathname.replace(`/dr/${slug}`, "");
              navigate(`/dr/${updated.slug}${rest}${location.search}`, { replace: true });
              return d;
            }
            return { ...d, profile: { ...d.profile, ...updated } };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
      if (featureChannel) supabase.removeChannel(featureChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const settings = previewSettings ? { ...data.settings, ...previewSettings } : data.settings;
  return <DoctorContext.Provider value={{ ...data, settings, hasFeature, refreshPractitioners }}>{children}</DoctorContext.Provider>;
};
