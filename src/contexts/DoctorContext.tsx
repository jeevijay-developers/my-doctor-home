import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type DoctorData = {
  profile: any;
  services: any[];
  packages: any[];
  reviews: any[];
  gallery: any[];
  settings: any;
  workingHours: any[];
  loading: boolean;
};

const DoctorContext = createContext<DoctorData>({
  profile: null, services: [], packages: [], reviews: [], gallery: [],
  settings: {}, workingHours: [], loading: true,
});

export const useDoctorData = () => useContext(DoctorContext);

export const DoctorProvider = ({ children }: { children: ReactNode }) => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<DoctorData>({
    profile: null, services: [], packages: [], reviews: [], gallery: [],
    settings: {}, workingHours: [], loading: true,
  });

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles").select("*")
        .eq("slug", slug).eq("onboarding_completed", true).single();

      if (!profile) { setData((d) => ({ ...d, loading: false })); return; }

      const id = profile.id;
      const [servRes, pkgRes, revRes, galRes, setRes, whRes] = await Promise.all([
        supabase.from("services").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
        supabase.from("packages").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
        supabase.from("reviews").select("*").eq("doctor_id", id).eq("is_visible", true).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("gallery_photos").select("*").eq("doctor_id", id).order("sort_order"),
        supabase.from("website_settings").select("*").eq("doctor_id", id).single(),
        supabase.from("working_hours").select("*").eq("doctor_id", id).order("day_of_week"),
      ]);

      setData({
        profile,
        services: servRes.data || [],
        packages: pkgRes.data || [],
        reviews: revRes.data || [],
        gallery: galRes.data || [],
        settings: setRes.data || {},
        workingHours: whRes.data || [],
        loading: false,
      });
    };
    load();
  }, [slug]);

  return <DoctorContext.Provider value={data}>{children}</DoctorContext.Provider>;
};
