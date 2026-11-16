// Vercel Edge entry for crawler-friendly HTML. See src/lib/seo/handleSeoRequest.ts.
import { handleSeoRequest } from "../src/lib/seo/handleSeoRequest";

// Run next to the Supabase project (Sydney): every request makes several round trips to it, and from
// the default region (nearest the visitor, e.g. Mumbai or the US for Googlebot) each one costs 0.5-1.3s.
export const config = { runtime: "edge", regions: ["syd1"] };

export default function handler(req: Request): Promise<Response> {
  return handleSeoRequest(req, {
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
}
