import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveSlugRedirect } from "@/lib/clinicSlugResolve";

/**
 * Returns `redirectOldSlug(slug)`: call it when a clinic lookup finds nothing. If `slug` is an old
 * address it navigates (replace) to the same page under the current slug and resolves true; the
 * caller should then stop. Resolves false when the slug is simply unknown. The function is stable.
 */
export function useOldSlugRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef({ navigate, location });
  ref.current = { navigate, location };
  return useCallback(async (slug: string): Promise<boolean> => {
    const target = await resolveSlugRedirect(slug, ref.current.location);
    if (!target) return false;
    ref.current.navigate(target, { replace: true });
    return true;
  }, []);
}
