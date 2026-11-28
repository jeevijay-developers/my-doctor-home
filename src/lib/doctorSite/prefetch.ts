import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_PROFILE_COLUMNS } from "@/lib/publicProfileColumns";
import type { Tables } from "@/integrations/supabase/types";
import type { PublicPractitioner } from "@/lib/practitioners/types";

/** One get_public_practitioners call. supabase-js resolves {error} instead of throwing, so check both. */
export async function fetchPractitioners(doctorId: string): Promise<{ list: PublicPractitioner[]; error: unknown }> {
  try {
    const res = await supabase.rpc("get_public_practitioners", { _doctor_id: doctorId });
    if (res?.error) return { list: [], error: res.error };
    return { list: (Array.isArray(res?.data) ? res.data : []) as unknown as PublicPractitioner[], error: null };
  } catch (e) {
    return { list: [], error: e };
  }
}

export async function fetchDoctorProfile(slug: string) {
  const { data } = await supabase
    .from("profiles").select(PUBLIC_PROFILE_COLUMNS)
    .eq("slug", slug).eq("onboarding_completed", true).maybeSingle();
  // Explicit column list (anon cannot read the sensitive columns); typed as the full row.
  return data as unknown as Tables<"profiles"> | null;
}

export function fetchDoctorBundle(id: string) {
  return Promise.all([
    supabase.from("services").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
    supabase.from("packages").select("*").eq("doctor_id", id).eq("active", true).order("sort_order"),
    supabase.from("reviews").select("*").eq("doctor_id", id).eq("is_visible", true).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("gallery_photos").select("*").eq("doctor_id", id).order("sort_order"),
    supabase.from("website_settings").select("*").eq("doctor_id", id).single(),
    supabase.from("working_hours").select("*").eq("doctor_id", id).order("day_of_week"),
    supabase.rpc("doctor_has_premium_access", { _doctor_id: id }),
    // A failed doctor lookup must never break the page: it then works as a single-doctor site.
    fetchPractitioners(id),
  ]);
}

export type DoctorBundle = Awaited<ReturnType<typeof fetchDoctorBundle>>;
export type DoctorPrefetch = { slug: string; startedAt: number; promise: Promise<{ profile: Awaited<ReturnType<typeof fetchDoctorProfile>>; bundle: DoctorBundle | null }> };

let pending: DoctorPrefetch | null = null;
const MAX_AGE_MS = 15_000;

/**
 * Starts the profile -> data requests of a doctor page before the page's JavaScript has even
 * downloaded, so they overlap with that download instead of following it. DoctorProvider takes the
 * result with takeDoctorPrefetch(); nothing else changes (same queries, same order).
 */
export function startDoctorPrefetch(slug: string) {
  const promise = (async () => {
    const profile = await fetchDoctorProfile(slug);
    return { profile, bundle: profile ? await fetchDoctorBundle(profile.id) : null };
  })();
  promise.catch(() => {});
  pending = { slug, startedAt: Date.now(), promise };
}

/** Pages that render a doctor site from the URL: /dr/:slug and /dr/:slug/doctor/:doctorSlug. */
export function prefetchForPath(pathname: string) {
  const m = /^\/dr\/([^/]+)(?:\/doctor\/[^/]+)?\/?$/.exec(pathname);
  if (!m) return;
  try {
    startDoctorPrefetch(decodeURIComponent(m[1]));
  } catch {
    // A malformed escape is just not a slug; the page loads normally.
  }
}

/** One-shot: returns the prefetch for this slug if it is fresh, otherwise null. */
export function takeDoctorPrefetch(slug: string): DoctorPrefetch | null {
  const p = pending;
  pending = null;
  if (!p || p.slug !== slug || Date.now() - p.startedAt > MAX_AGE_MS) return null;
  return p;
}
