import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { buildBioPrompt, cleanBioOutput, parseBioRequest } from "../_shared/aiBio.ts";

// Writes a short plain-text doctor bio from the doctor's own details. Available to every plan: a bio is
// a core profile field, so it is only gated by sign-in and a per-user rate limit. The text is returned
// to the browser to be reviewed and edited; nothing is saved here.

const AI_BIO_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  bindCorsRequest(req, AI_BIO_CORS);
  const preflight = handleCors(req, AI_BIO_CORS);
  if (preflight) return preflight;

  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Not authenticated" }, 401);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }
    const parsed = parseBioRequest(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("ai-bio-writer: GEMINI_API_KEY is not configured");
      return json({ error: "AI writing is not available right now." }, 500);
    }

    // 10 bios / hour for this signed-in user (doctor, staff or doctor login).
    const limited = await enforceRateLimit(admin, {
      key: `ai-bio-writer:user:${userId}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (limited) return limited;

    const prompt = buildBioPrompt(parsed.value);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const modelCandidates = ["gemini-2.5-flash", "gemini-2.0-flash"];
    const attempts: Array<{ model: string; status: number }> = [];
    let geminiData: any = null;

    for (const model of modelCandidates) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
        try {
          const response = await fetch(url, {
            method: "POST",
            // The key travels in a header, never in the URL, so no error text can contain it.
            headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 700,
                ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
            signal: controller.signal,
          });
          const status = response.status;
          const body = await response.text();
          if (response.ok) {
            try {
              geminiData = JSON.parse(body);
              break;
            } catch (_) { /* fall through to retry bookkeeping */ }
          }
          attempts.push({ model: `${model} (attempt ${attempt + 1})`, status });
          if (status !== 503 && status !== 429) break;
        } catch (fetchErr) {
          const isTimeout = fetchErr instanceof Error && fetchErr.name === "AbortError";
          attempts.push({ model: `${model} (attempt ${attempt + 1})`, status: isTimeout ? 504 : 500 });
          if (isTimeout) break;
        }
      }
      if (geminiData) break;
    }
    clearTimeout(timeoutId);

    if (!geminiData) {
      console.error("ai-bio-writer: Gemini failed", attempts.map((a) => `${a.model} (${a.status})`));
      const upstream = attempts[attempts.length - 1]?.status;
      const status = upstream === 429 ? 429 : upstream === 504 ? 504 : 502;
      return json({ error: "AI writing failed. Please try again in a moment." }, status);
    }

    const bio = cleanBioOutput(geminiData.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!bio) {
      console.error("ai-bio-writer: empty or unusable model output");
      return json({ error: "The AI did not return a usable bio. Please try again." }, 502);
    }
    return json({ bio });
  } catch (e) {
    console.error("ai-bio-writer error:", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
