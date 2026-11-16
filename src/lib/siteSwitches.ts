// Temporary kill switch for the public "Find a Doctor" directory (/doctors...).
// To bring it back: set false AND remove the "/doctors" redirects block in vercel.json.
// NOTE: imported by src/lib/seo/* (bundled by Vercel), so keep this file import-free.
export const DIRECTORY_HIDDEN = true;
