// Doctor bio helpers: a deterministic "fill from my details" draft, a checklist of what helps a bio
// show up in Google, soft advertising-claim warnings, and a sanitiser. Pure and plain text only:
// bios are rendered as text nodes everywhere, so markup and markdown never belong in one.

/** Mirrors MIN_INDEXABLE_BIO_CHARS in src/lib/profileCompleteness.ts (below this a doctor page is noindex). */
export const BIO_MIN_INDEXABLE = 60;
export const BIO_MAX = 2000;
/** A comfortable length for search: enough to mention specialty, place, qualifications and booking. */
export const BIO_IDEAL_MIN = 400;
export const BIO_IDEAL_MAX = 900;

export interface BioDetails {
  name?: string | null;
  specialization?: string | null;
  qualifications?: string | null;
  experienceYears?: number | string | null;
  clinicName?: string | null;
  locality?: string | null;
  city?: string | null;
  /** Service names; only the first 6 are used. */
  services?: Array<string | null | undefined> | null;
  /** Conditions or treatments the doctor ticked (opt-in, never added automatically). */
  conditions?: Array<string | null | undefined> | null;
}

const MAX_SERVICES = 6;
const MAX_CONDITIONS = 8;

/** One clean line: tags, control characters and repeated spaces removed, bounded in length. */
const clean = (v: unknown, max: number): string => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
};

const list = (items: Array<string | null | undefined> | null | undefined, limit: number, max: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items ?? []) {
    const v = clean(raw, max);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
};

const joinList = (items: string[]): string => {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

/** "Dr. Meera Shah" whether or not the stored name already starts with Dr / Dr. */
export const displayDoctorName = (name?: string | null): string => {
  const n = clean(name, 100).replace(/^dr\.?(?=\s|$)\s*/i, "").trim();
  return n ? `Dr. ${n}` : "";
};

const article = (word: string): string => (/^(?:[aeiou]|ent\b)/i.test(word) && !/^u[rn]/i.test(word) ? "an" : "a");

/**
 * A plain-text third-person bio built only from the details given. No pronouns (so no guess about
 * gender), no claims beyond the supplied facts, and a sentence is left out when its data is missing.
 * Returns "" when there is neither a name nor a specialization to talk about.
 */
export function buildBioFromDetails(input: BioDetails): string {
  const name = displayDoctorName(input.name);
  const spec = clean(input.specialization, 100);
  if (!name && !spec) return "";
  const quals = clean(input.qualifications, 200);
  const clinic = clean(input.clinicName, 120);
  const locality = clean(input.locality, 80);
  const city = clean(input.city, 80);
  const years = Math.floor(Number(input.experienceYears));
  const services = list(input.services, MAX_SERVICES, 80);
  const conditions = list(input.conditions, MAX_CONDITIONS, 80);

  const subject = name || `This ${spec}`;
  const place = [locality, city].filter(Boolean).join(", ");
  const sentences: string[] = [];

  // 1. Who, what, where, how long.
  let first = name ? `${name} is ${article(spec || "doctor")} ${spec || "doctor"}` : `${subject}`;
  if (!name) first = `${first} is practising`;
  if (place) first += ` in ${place}`;
  if (Number.isFinite(years) && years > 0) first += ` with ${years}+ years of experience`;
  if (quals) first += ` (${quals})`;
  sentences.push(`${first}.`);

  // 2. Where patients can find them.
  if (clinic) {
    sentences.push(`Patients can consult ${subject} at ${clinic}${place ? `, ${place}` : ""}.`);
  }

  // 3. Services and (opt-in) conditions.
  if (services.length) sentences.push(`Services offered include ${joinList(services)}.`);
  if (conditions.length) sentences.push(`${subject} sees patients for ${joinList(conditions)}.`);

  // 4. What a visit covers (generic, factual) and a booking sentence that carries the search words.
  if (spec) {
    sentences.push(`A visit covers a careful examination, a clear diagnosis and an explanation of the treatment options available.`);
  }
  const looking = spec ? `Looking for ${article(spec)} ${spec}${city ? ` in ${city}` : ""}? ` : "";
  sentences.push(`${looking}You can book an appointment online with ${subject} through this website.`);

  return sentences.join(" ").replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, "").trim();
}

/** Conditions and treatments commonly consulted for, per specialization. Offered as OPT-IN ticks only. */
export const SPECIALTY_TOPICS: Record<string, string[]> = {
  "General Physician": ["fever and infections", "diabetes care", "high blood pressure", "thyroid problems", "cough and cold", "general health check-ups"],
  Cardiologist: ["high blood pressure", "chest pain", "heart rhythm problems", "cholesterol management", "heart failure", "heart health check-ups"],
  Dermatologist: ["acne", "skin allergies", "hair fall", "eczema", "fungal skin infections", "pigmentation", "dandruff"],
  Orthopedic: ["joint pain", "fractures", "knee pain", "back pain", "sports injuries", "arthritis", "shoulder pain"],
  Pediatrician: ["child vaccinations", "fever in children", "growth and development", "childhood infections", "newborn care", "nutrition for children"],
  Gynecologist: ["pregnancy care", "irregular periods", "PCOS", "menopause", "family planning", "white discharge"],
  "ENT Specialist": ["ear infections", "sinusitis", "tonsillitis", "hearing problems", "throat pain", "nasal allergies", "snoring"],
  Neurologist: ["headache and migraine", "epilepsy", "stroke care", "dizziness", "numbness and tingling", "memory problems"],
  Psychiatrist: ["anxiety", "depression", "stress", "sleep problems", "addiction counselling", "mood disorders"],
  Ophthalmologist: ["eye check-ups", "cataract", "glaucoma", "dry eyes", "refractive errors and spectacles", "diabetic eye care"],
  Dentist: ["tooth pain", "dental fillings", "root canal treatment", "teeth cleaning", "tooth extraction", "dentures and crowns"],
  Urologist: ["kidney stones", "urinary infections", "prostate problems", "blood in urine", "male infertility"],
  Pulmonologist: ["asthma", "chronic cough", "COPD", "breathlessness", "sleep apnea", "lung infections"],
  Gastroenterologist: ["acidity and reflux", "stomach pain", "constipation", "liver problems", "irritable bowel syndrome", "gallstones"],
  Oncologist: ["cancer screening", "cancer diagnosis and treatment planning", "chemotherapy", "follow-up care after cancer treatment"],
  Endocrinologist: ["diabetes", "thyroid disorders", "obesity and weight problems", "hormonal imbalance", "PCOS", "growth problems"],
  Nephrologist: ["kidney disease", "high blood pressure with kidney disease", "dialysis care", "kidney stones", "swelling and protein in urine"],
  Rheumatologist: ["arthritis", "joint pain and swelling", "gout", "lupus", "autoimmune conditions", "back pain"],
  Surgeon: ["hernia", "piles", "gallbladder stones", "appendicitis", "wound care", "lumps and swellings"],
  Other: [],
  Diabetologist: ["type 2 diabetes", "type 1 diabetes", "gestational diabetes", "diabetic foot care", "blood sugar monitoring", "diabetes diet advice"],
  Orthodontist: ["braces", "clear aligners", "crooked teeth", "bite problems", "jaw alignment"],
  "Pediatric Dentist": ["children's tooth decay", "milk teeth care", "fluoride treatment", "habit-related teeth problems"],
  Physiotherapist: ["back pain", "neck pain", "knee pain", "recovery after surgery", "sports injuries", "posture problems"],
  "Dietitian / Nutritionist": ["weight management", "diabetes diet", "PCOS diet", "heart-healthy diet", "child nutrition"],
  Homeopath: ["allergies", "skin problems", "chronic cough and cold", "digestive problems", "women's health"],
  "Ayurveda Doctor": ["digestive problems", "joint pain", "skin problems", "stress and sleep", "lifestyle disorders"],
  Neurosurgeon: ["brain and spine conditions", "head injury", "slip disc", "brain tumours", "nerve compression"],
  "Plastic Surgeon": ["burn scars", "cleft lip and palate care", "hand surgery", "breast reconstruction", "scar correction"],
  Radiologist: ["X-ray reporting", "ultrasound", "CT scan reporting", "MRI reporting"],
  Anesthesiologist: ["pre-surgery assessment", "pain management", "anaesthesia for surgery"],
  Pathologist: ["blood tests", "urine tests", "tissue and biopsy reports"],
  Sexologist: ["sexual health counselling", "erectile problems", "fertility counselling"],
  "Fertility Specialist": ["infertility evaluation", "IUI", "IVF", "ovulation problems", "male infertility"],
};

/** Looks a specialization up case-insensitively, tolerating common variants ("Orthopaedic", "Dentistry"). */
export function topicsFor(specialization?: string | null): string[] {
  const s = clean(specialization, 100).toLowerCase();
  if (!s) return [];
  const direct = Object.keys(SPECIALTY_TOPICS).find((k) => k.toLowerCase() === s);
  if (direct) return SPECIALTY_TOPICS[direct];
  const alias: Array<[RegExp, string]> = [
    [/ortho/, "Orthopedic"], [/paed|pedia/, "Pediatrician"], [/gyn|obstet/, "Gynecologist"], [/\bent\b|otolaryn/, "ENT Specialist"],
    [/dent/, "Dentist"], [/physician|general med/, "General Physician"], [/cardio/, "Cardiologist"], [/derma|skin/, "Dermatologist"],
    [/neuro/, "Neurologist"], [/psych/, "Psychiatrist"], [/ophthal|eye/, "Ophthalmologist"], [/uro/, "Urologist"],
    [/pulmon|chest/, "Pulmonologist"], [/gastro/, "Gastroenterologist"], [/onco/, "Oncologist"], [/endocrin/, "Endocrinologist"],
    [/nephro/, "Nephrologist"], [/rheum/, "Rheumatologist"], [/surg/, "Surgeon"], [/physio/, "Physiotherapist"],
    [/diet|nutrition/, "Dietitian / Nutritionist"], [/homeo|homoeo/, "Homeopath"], [/ayur/, "Ayurveda Doctor"],
  ];
  const hit = alias.find(([re]) => re.test(s));
  return hit ? SPECIALTY_TOPICS[hit[1]] : [];
}

// ---------------------------------------------------------------------------------------------

export interface BioContext {
  specialization?: string | null;
  qualifications?: string | null;
  experienceYears?: number | string | null;
  city?: string | null;
  locality?: string | null;
}

export interface BioCheck {
  key: "specialty" | "place" | "qualifications" | "experience" | "booking" | "length";
  /** Short label that reads on its own ("Mentions your specialty"). */
  label: string;
  ok: boolean;
}

export interface BioWarning {
  term: string;
  message: string;
}

export type BioLevel = "empty" | "short" | "fair" | "good";

export interface BioAnalysis {
  /** Characters after collapsing whitespace (what the indexing rule counts). */
  length: number;
  indexable: boolean;
  level: BioLevel;
  checks: BioCheck[];
  lengthHint: string;
  warnings: BioWarning[];
}

const RISKY: Array<{ term: string; re: RegExp; message: string }> = [
  { term: "best", re: /\bbest\b/i, message: "\"best\" is a comparison. Indian medical advertising rules ask doctors not to claim to be better than others." },
  { term: "top", re: /\btop\b/i, message: "\"top\" is a ranking claim. Leave it out unless you can show where it comes from." },
  { term: "no.1", re: /\bno\.?\s*1\b|\bnumber\s*(?:one|1)\b|\b#\s*1\b/i, message: "\"No. 1\" is a ranking claim and is not allowed in medical advertising." },
  { term: "guarantee", re: /\bguarantee[sd]?\b/i, message: "Treatment results cannot be guaranteed, so avoid the word \"guarantee\"." },
  { term: "100%", re: /100\s*%/, message: "\"100%\" promises a result. Please avoid it." },
  { term: "cure", re: /\bcure[sd]?\b|\bcuring\b/i, message: "Avoid saying you \"cure\" a condition (and never \"permanent cure\"). Say you \"treat\" or \"manage\" it." },
  { term: "miracle", re: /\bmiracle\b|\bmiraculous\b/i, message: "\"miracle\" is an exaggerated claim. Please remove it." },
  { term: "award-winning", re: /award[\s-]+winning/i, message: "Only say \"award-winning\" if it is true and you can name the award." },
];

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Checks a bio against what helps Google match it to a patient's search, and flags claims that medical
 * advertising rules discourage. Flags only; nothing here blocks saving.
 */
export function analyzeBio(text: string, ctx: BioContext = {}): BioAnalysis {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const lower = words(t);
  const has = (needle: string) => {
    const n = words(needle);
    return n.length > 0 && ` ${lower} `.includes(` ${n} `);
  };
  const checks: BioCheck[] = [];

  const spec = clean(ctx.specialization, 100);
  if (spec && spec.toLowerCase() !== "other") {
    const base = spec.replace(/\s*specialist$/i, "");
    checks.push({ key: "specialty", label: "Mentions your specialty", ok: has(spec) || has(base) || has(`${spec}s`) });
  }
  const city = clean(ctx.city, 80);
  const locality = clean(ctx.locality, 80);
  if (city || locality) {
    checks.push({ key: "place", label: "Mentions your city or area", ok: (!!city && has(city)) || (!!locality && has(locality)) });
  }
  const quals = clean(ctx.qualifications, 200)
    .split(/[,;/]+/)
    .map((q) => q.trim())
    .filter(Boolean);
  if (quals.length) {
    checks.push({ key: "qualifications", label: "Mentions your qualifications", ok: quals.some((q) => has(q)) });
  }
  const years = Math.floor(Number(ctx.experienceYears));
  if (Number.isFinite(years) && years > 0) {
    checks.push({ key: "experience", label: "Mentions your years of experience", ok: /\b\d{1,2}\s*\+?\s*(?:years?|yrs?)\b/i.test(t) });
  }
  checks.push({
    key: "booking",
    label: "Invites patients to book or consult",
    ok: /\b(book(?:ing)?|appointments?|consult(?:ation|ations)?)\b/i.test(t),
  });
  checks.push({ key: "length", label: `At least ${BIO_MIN_INDEXABLE} characters`, ok: t.length >= BIO_MIN_INDEXABLE });

  const warnings: BioWarning[] = RISKY.filter((r) => r.re.test(t)).map(({ term, message }) => ({ term, message }));

  const indexable = t.length >= BIO_MIN_INDEXABLE;
  const allOk = checks.every((c) => c.ok);
  let level: BioLevel;
  if (!t) level = "empty";
  else if (!indexable) level = "short";
  else if (allOk && t.length >= BIO_IDEAL_MIN) level = "good";
  else level = "fair";

  let lengthHint: string;
  if (!t) lengthHint = `Aim for ${BIO_IDEAL_MIN}-${BIO_IDEAL_MAX} characters for search.`;
  else if (!indexable) lengthHint = `Add ${BIO_MIN_INDEXABLE - t.length} characters to reach the ${BIO_MIN_INDEXABLE} Google needs to list your page. Aim for ${BIO_IDEAL_MIN}-${BIO_IDEAL_MAX}.`;
  else if (t.length < BIO_IDEAL_MIN) lengthHint = `Long enough to be listed. Aim for ${BIO_IDEAL_MIN}-${BIO_IDEAL_MAX} characters for search.`;
  else if (t.length > BIO_IDEAL_MAX) lengthHint = `Longer than needed. ${BIO_IDEAL_MIN}-${BIO_IDEAL_MAX} characters reads best in search.`;
  else lengthHint = "A good length for search.";

  return { length: t.length, indexable, level, checks, lengthHint, warnings };
}

/**
 * Makes pasted or AI-written text safe to store as a plain-text bio: HTML tags, markdown markers and
 * control characters removed, blank lines collapsed, hard limit BIO_MAX.
 */
export function sanitizeBio(text: string): string {
  const s = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "")
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.slice(0, BIO_MAX).trim();
}
