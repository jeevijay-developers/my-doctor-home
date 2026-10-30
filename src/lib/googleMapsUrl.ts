// A doctor's Google Maps / Google Business Profile link. The database only
// requires https (profiles_google_maps_url_format); this narrower check keeps
// the field to genuine Google Maps links and is what the UI and the SEO
// markup (schema.org hasMap) rely on.
//
// NOTE: imported by src/lib/seo/*, which Vercel bundles - no "@/" imports here.
// The TLD part is explicit (com, co.xx, or a 2-3 letter ccTLD) and must be followed by "/", "?", "#" or the
// end, so look-alikes such as google.com.evil.com or maps.google.com.evil.com are rejected.
const TLD = String.raw`(?:com|co\.[a-z]{2}|[a-z]{2,3})`;
const GOOGLE_MAPS_URL = new RegExp(
  String.raw`^https://(?:(?:www\.)?google\.${TLD}/maps|maps\.google\.${TLD}|maps\.app\.goo\.gl|goo\.gl/maps|g\.page|share\.google|business\.google\.com)(?:[/?#]\S*)?$`,
  "i",
);

export function isGoogleMapsUrl(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length > 0 && v.length <= 500 && GOOGLE_MAPS_URL.test(v);
}
