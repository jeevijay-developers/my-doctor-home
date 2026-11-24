import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";

export interface GettingStartedStep {
  label: string;
  done: boolean;
  href: string;
}

export interface GettingStarted {
  checklist: GettingStartedStep[];
  completedSteps: number;
  ready: boolean;
}

export function useGettingStarted(): GettingStarted {
  const { profile } = useProfile();
  const [servicesCount, setServicesCount] = useState(0);
  const [blogCount, setBlogCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const id = profile.id;
    Promise.all([
      supabase.from("services").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("active", true),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("is_published", true),
    ]).then(([svcRes, blogRes]) => {
      setServicesCount(svcRes.count || 0);
      setBlogCount(blogRes.count || 0);
      setReady(true);
    });
  }, [profile]);

  const checklist: GettingStartedStep[] = [
    { label: "Complete your profile", done: !!profile?.full_name && !!profile?.specialization, href: "/admin/settings" },
    { label: "Add your services", done: servicesCount > 0, href: "/admin/my-website" },
    { label: "Set working hours", done: true, href: "/admin/my-website" },
    { label: "Publish your website", done: !!profile?.onboarding_completed, href: "/admin/my-website" },
    { label: "Write your first blog", done: blogCount > 0, href: "/admin/blog" },
  ];
  const completedSteps = checklist.filter((c) => c.done).length;

  return { checklist, completedSteps, ready };
}
