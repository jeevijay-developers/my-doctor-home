// Pure text helpers for head tags: title fitting, description trimming, detecting an SEO title or
// description that the app itself generated earlier (and saved into website_settings), and reading
// coordinates out of a Google Maps link.
//
// NOTE: no imports on purpose (bundled by Vercel; also read by the client page head).

export const TITLE_SUFFIX = " | Doctylia";
/** Google shows about 60 characters of a title. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

const collapse = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * The first candidate that fits `max` characters. Candidates go from richest to barest; when none fits
 * the barest one is returned unchanged (a name is never cut mid-word).
 */
export function fitTitle(candidates: string[], max: number = TITLE_MAX): string {
  const list = candidates.map(collapse).filter(Boolean);
  if (!list.length) return "";
  return list.find((c) => c.length <= max) ?? list[list.length - 1];
}

/**
 * Title ladder for "<name> - <specialties> in <city> | Doctylia": drop the " | Doctylia" first, then cut
 * the specialties down to one, then drop them, then the city.
 */
export function titleCandidates(name: string, specialties: string[], city: string): string[] {
  const specs = specialties.map(collapse).filter(Boolean);
  const where = collapse(city) ? ` in ${collapse(city)}` : "";
  const withSpecs = (list: string[]) => `${name}${list.length ? ` - ${list.join(", ")}` : ""}${where}`;
  const out = [withSpecs(specs) + TITLE_SUFFIX, withSpecs(specs)];
  if (specs.length > 1) out.push(withSpecs(specs.slice(0, 1)));
  if (specs.length) out.push(`${name}${where}`);
  out.push(name);
  return [...new Set(out)];
}

/** One-line description of at most `max` characters, cut at a word boundary with an ellipsis. */
export function trimDescription(text: unknown, max: number = DESCRIPTION_MAX): string {
  const t = collapse(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atWord = cut.replace(/\s+\S*$/, "");
  return `${(atWord.length >= max * 0.6 ? atWord : cut).replace(/[\s,;:.\-]+$/, "")}…`;
}

// ---------------------------------------------------------------------------------------------
// Auto-generated SEO values.
//
// MyWebsite pre-fills the SEO boxes with the generated text and saves it back, so most clinics have
// the generated (doctor-led) title and description stored as if they were typed by the owner. Those
// must not override the clinic-first title of a team page. A value counts as generated when it equals
// what a builder would produce now, or has the shape the old generator always produced (which also
// catches a doctor who was renamed or moved city since).
// ---------------------------------------------------------------------------------------------

/** "Dr. Name[ - Specialty][ in City] | Doctylia": the only shape the app ever generated for a doctor. */
const AUTO_TITLE_SHAPE = /^Dr\.?\s+[^|]+\s\|\sDoctylia$/;
/** "Book an appointment with Dr. ... Clinic timings, fees, services and patient reviews on Doctylia." */
const AUTO_DESCRIPTION_SHAPES = [
  /^Book an appointment with Dr\.?\s.+\.\sClinic timings, fees, services and patient reviews on Doctylia\.$/,
  // The first team-clinic template, in case one was ever saved.
  /^.+ has \d+ doctors?(?: \([^)]*\))?\. Book an appointment online and see timings, fees, services and patient reviews on Doctylia\.$/,
];

export function isAutoSeoTitle(stored: unknown, generated: string[] = []): boolean {
  const s = collapse(stored);
  if (!s) return true;
  return generated.some((g) => collapse(g) === s) || AUTO_TITLE_SHAPE.test(s);
}

/**
 * `generated` holds what builders produce for the current profile; `fromProfileText` holds free text the
 * app copies into the description when nothing else is set (the owner's bio, the hero line).
 */
export function isAutoSeoDescription(stored: unknown, generated: string[] = [], fromProfileText: unknown[] = []): boolean {
  const s = collapse(stored);
  if (!s) return true;
  if (generated.some((g) => collapse(g) === s)) return true;
  if (AUTO_DESCRIPTION_SHAPES.some((re) => re.test(s))) return true;
  // MyWebsite stores the bio cut at 160 characters; ours cuts at a word boundary, so allow either.
  return fromProfileText.some((t) => {
    const full = collapse(t);
    return !!full && (collapse(full.slice(0, DESCRIPTION_MAX)) === s || trimDescription(full) === s);
  });
}

// ---------------------------------------------------------------------------------------------
// Coordinates from a Google Maps link.
// ---------------------------------------------------------------------------------------------

function validCoords(lat: number, lng: number): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is what a broken link resolves to; no clinic is there.
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * `!3d<lat>!4d<lng>` (the place's own pin, preferred) or `@<lat>,<lng>` (the map centre). Short links
 * (maps.app.goo.gl, goo.gl/maps) and `?q=<address>` carry no coordinates and give null.
 */
export function parseMapsLatLng(url: unknown): { latitude: number; longitude: number } | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const pin = new RegExp(`!3d${num}!4d${num}`).exec(text);
  if (pin) {
    const c = validCoords(Number(pin[1]), Number(pin[2]));
    if (c) return c;
  }
  const at = new RegExp(`@${num},${num}(?:[,/]|$)`).exec(text);
  if (at) return validCoords(Number(at[1]), Number(at[2]));
  return null;
}
