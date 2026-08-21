import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type DoctorData = {
  profile: any;
  services: any[];
  packages: any[];
  reviews: any[];
  gallery: any[];
  settings: any;
  workingHours: any[];
  isPremium: boolean;
  // Per-feature effective access (plan default + any active Superadmin
  // override) — e.g. hasFeature("online_consultation"). Falls back to false
  // for an unknown key or before the flags have loaded.
  hasFeature: (key: string) => boolean;
  loading: boolean;
};

const DoctorContext = createContext<DoctorData>({
  profile: null, services: [], packages: [], reviews: [], gallery: [],
  settings: {}, workingHours: [], isPremium: false, hasFeature: () => false, loading: true,
});

export const useDoctorData = () => useContext(DoctorContext);

export const DoctorProvider = ({ children }: { children: ReactNode }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<Omit<DoctorData, "hasFeature">>({
    profile: null, services: [], packages: [], reviews: [], gallery: [],
    settings: {}, workingHours: [], isPremium: false, loading: true,
  });
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});

  const hasFeature = useCallback((key: string) => featureFlags[key] ?? false, [featureFlags]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let featureChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadFeatureFlags = async (doctorId: string) => {
      const { data: flags } = await supabase.rpc("get_public_feature_flags", { _doctor_id: doctorId });
      if (cancelled) return;
      setFeatureFlags(Object.fromEntries((flags || []).map((f: any) => [f.feature_key, f.effective_enabled === true])));
    };

    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles").select("*")
        .eq("slug", slug).eq("onboarding_completed", true).maybeSingle();

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
      const [servRes, pkgRes, revRes, galRes, setRes, whRes, premiumRes] = await Promise.all([
        supabase.from("services").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
        supabase.from("packages").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
        supabase.from("reviews").select("*").eq("doctor_id", id).eq("is_visible", true).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("gallery_photos").select("*").eq("doctor_id", id).order("sort_order"),
        supabase.from("website_settings").select("*").eq("doctor_id", id).single(),
        supabase.from("working_hours").select("*").eq("doctor_id", id).order("day_of_week"),
        supabase.rpc("doctor_has_premium_access", { _doctor_id: id }),
      ]);

      if (cancelled) return;
      setData({
        profile,
        services: servRes.data || [],
        packages: pkgRes.data || [],
        reviews: revRes.data || [],
        gallery: galRes.data || [],
        settings: setRes.data || {},
        workingHours: whRes.data || [],
        isPremium: premiumRes.data === true,
        loading: false,
      });

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
      supabase.removeChannel(channel);
      if (featureChannel) supabase.removeChannel(featureChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return <DoctorContext.Provider value={{ ...data, hasFeature }}>{children}</DoctorContext.Provider>;
};
