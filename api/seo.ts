// Vercel Edge entry for crawler-friendly HTML. See src/lib/seo/handleSeoRequest.ts.
import { handleSeoRequest } from "../src/lib/seo/handleSeoRequest";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  return handleSeoRequest(req, {
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
}
