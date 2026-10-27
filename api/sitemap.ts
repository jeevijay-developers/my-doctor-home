// Vercel Edge entry for /sitemap.xml. See src/lib/seo/proxySitemap.ts.
import { proxySitemap } from "../src/lib/seo/proxySitemap";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  return proxySitemap(req, process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
}
