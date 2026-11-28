import { supabase } from "@/integrations/supabase/client";
import { swapSlugInPath } from "./clinicSlug";

/** Current slug for a current or old clinic slug (null when unknown or on any error). */
export async function resolveClinicSlug(slug: string): Promise<string | null> {
  try {
    const { data, error } = await (supabase.rpc as any)("resolve_clinic_slug", { _slug: slug });
    if (error || typeof data !== "string" || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Where an old-slug URL should go: same path suffix and query under the clinic's current slug.
 * Null when the slug is unknown or already current (so callers can show "not found" normally).
 */
export async function resolveSlugRedirect(
  slug: string,
  loc: { pathname: string; search?: string; hash?: string },
): Promise<string | null> {
  const current = await resolveClinicSlug(slug);
  if (!current || current === slug) return null;
  return swapSlugInPath(loc.pathname, slug, current, loc.search ?? "", loc.hash ?? "");
}
