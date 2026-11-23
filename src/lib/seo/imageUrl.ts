// Doctors upload full-size PNGs (a 40px avatar was a 1.5 MB file). Supabase Storage
// can resize and re-encode on the fly through its /render/image endpoint, so the
// public doctor page asks for the size it actually displays.
//
// Relative imports only: this file is also bundled into the Vercel Edge function.

const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * Returns a resized rendition URL for a Supabase Storage public object, or the
 * original URL untouched for anything else (external hosts, data: URLs, blobs, or
 * a URL that already points at the render endpoint).
 *
 * `width` is the CSS width x ~2 for high-DPI screens. Aspect ratio is preserved
 * and the format is negotiated from the Accept header (WebP/AVIF where supported).
 */
export function optimizedImageUrl(url: string | null | undefined, width: number, quality = 75): string {
  if (!url) return "";
  if (!url.includes(OBJECT_PATH)) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith(OBJECT_PATH)) return url;
    parsed.pathname = parsed.pathname.replace(OBJECT_PATH, RENDER_PATH);
    parsed.searchParams.set("width", String(Math.round(width)));
    parsed.searchParams.set("quality", String(quality));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Width used for the hero portrait; shared so the edge-injected preload matches the <img>. */
export const HERO_IMAGE_WIDTH = 800;
