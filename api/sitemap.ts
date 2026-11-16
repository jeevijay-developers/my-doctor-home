// Vercel Edge entry for /sitemap.xml. See src/lib/seo/proxySitemap.ts.
import { proxySitemap } from "../src/lib/seo/proxySitemap";

// Run next to the Supabase project (Sydney): every request makes several round trips to it, and from
// the default region (nearest the visitor, e.g. Mumbai or the US for Googlebot) each one costs 0.5-1.3s.
export const config = { runtime: "edge", regions: ["syd1"] };

export default function handler(req: Request): Promise<Response> {
  return proxySitemap(req, process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
}
