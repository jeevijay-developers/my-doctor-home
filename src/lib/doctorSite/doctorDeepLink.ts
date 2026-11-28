/** The doctor slug of a `?doctor=<slug>` booking deep link, lower-cased; null when absent or not a plain slug. */
export const doctorSlugFromSearch = (search: string): string | null => {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get("doctor");
  } catch {
    return null;
  }
  const slug = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ? slug : null;
};
