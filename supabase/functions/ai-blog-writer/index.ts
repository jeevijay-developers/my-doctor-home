import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const AI_BLOG_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_TOPIC_LENGTH = 300;
const MAX_NAME_LENGTH = 100;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  bindCorsRequest(req, AI_BLOG_CORS);
  const preflight = handleCors(req, AI_BLOG_CORS);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const doctorId = userData?.user?.id;
    if (!doctorId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowed } = await admin.rpc("doctor_has_feature", {
      _doctor_id: doctorId,
      _feature_key: "ai_blog_writer",
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "AI Blog Writer is not available on this plan" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const badRequest = (error: string) =>
      new Response(JSON.stringify({ error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validate and bound everything that reaches the prompt (cost/quota abuse, prompt injection).
    // doctorName / specialization sit inside the system prompt, so control characters and
    // newlines are flattened to spaces and quotes dropped.
    const oneLine = (v: unknown, max: number): string | null | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      if (typeof v !== "string") return null;
      const cleaned = v.replace(/[\x00-\x1f\x7f\u2028\u2029"`]+/g, " ").replace(/\s+/g, " ").trim();
      return cleaned.length > max ? null : cleaned;
    };
    const rawTopic = parsed?.topic;
    if (typeof rawTopic !== "string" || !rawTopic.trim()) return badRequest("topic is required");
    if (rawTopic.length > MAX_TOPIC_LENGTH) return badRequest(`topic must be at most ${MAX_TOPIC_LENGTH} characters`);
    const topic = rawTopic.replace(/[\x00-\x1f\x7f\u2028\u2029"]+/g, " ").replace(/\s+/g, " ").trim();
    const doctorName = oneLine(parsed?.doctorName, MAX_NAME_LENGTH);
    const specialization = oneLine(parsed?.specialization, MAX_NAME_LENGTH);
    if (doctorName === null) return badRequest("doctorName is invalid or too long");
    if (specialization === null) return badRequest("specialization is invalid or too long");

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("ai-blog-writer: GEMINI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI generation is not available right now." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 20 generations / hour for this signed-in doctor.
    const limited = await enforceRateLimit(admin, {
      key: `ai-blog-writer:doctor:${doctorId}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (limited) return limited;

    const systemPrompt = `You are a medical content writer for an Indian doctor's website. Write professional, patient-friendly health articles. The doctor is ${doctorName || "a doctor"}, specializing in ${specialization || "general medicine"}.

Rules:
- Write in clear, simple English that Indian patients can understand
- Open with a direct 40-60 word answer to the question the title asks, before any background
- Use question-style "##" headings that match what patients actually search (for example "What causes ...?")
- Include a "## When to see a doctor" section listing warning signs, and end with a short "## Key takeaways" list
- Be medically accurate and consistent with established guidance (WHO, ICMR, Indian clinical guidelines); name the source when you rely on one
- Never invent statistics, studies, quotations, or drug doses. If you are not certain of a number, leave it out
- Avoid overly technical jargon; explain medical terms in plain words
- Add a disclaimer: "This article is for educational purposes only. Always consult your doctor for personalized advice."
- Structure with proper headings using ## and ### markdown
- Aim for 500-800 words, warm and reassuring in tone`;

    const GEMINI_TIMEOUT_MS = 40_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    // Active Gemini models for this API key
    const modelCandidates = ["gemini-2.5-flash", "gemini-2.0-flash"];
    const attempts: Array<{ model: string; status: number; text: string }> = [];
    let geminiData: any = null;

    for (const model of modelCandidates) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1200));
        }
        try {
          const response = await fetch(geminiUrl, {
            method: "POST",
            // The key travels in a header, never in the URL, so no error text can contain it.
            headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `${systemPrompt}\n\nWrite a health blog article about: "${topic}". You MUST return ONLY a valid JSON object (no text outside JSON) with keys:
"title": string (Article title)
"excerpt": string (1-2 sentence summary)
"content": string (Full article content in markdown format)
"category": string (One of: General Health, Heart Health, Diabetes, Skin Care, Mental Health, Nutrition, Fitness, Women's Health, Children's Health, Prevention)`
                    }
                  ]
                }
              ]
            }),
            signal: controller.signal,
          });

          const status = response.status;
          const text = await response.text();

          if (response.ok) {
            try {
              geminiData = JSON.parse(text);
              break; // Success!
            } catch (_) {}
          }

          attempts.push({ model: `${model} (attempt ${attempt + 1})`, status, text });

          // Retry on 503 / 429
          if (status !== 503 && status !== 429) {
            break;
          }
        } catch (fetchErr) {
          const isTimeout = fetchErr instanceof Error && fetchErr.name === "AbortError";
          attempts.push({
            model: `${model} (attempt ${attempt + 1})`,
            status: isTimeout ? 504 : 500,
            text: isTimeout ? "Timed out" : (fetchErr instanceof Error ? fetchErr.message : "Fetch failed"),
          });
          if (isTimeout) break;
        }
      }

      if (geminiData) break;
    }

    clearTimeout(timeoutId);

    if (!geminiData) {
      const lastAttempt = attempts[attempts.length - 1];
      // Upstream bodies / network errors stay in the server log; the client gets a generic message.
      console.error("ai-blog-writer: Gemini failed", attempts.map((a) => `${a.model} (${a.status})`));
      const upstream = lastAttempt?.status;
      const status = upstream === 429 ? 429 : upstream === 504 ? 504 : 502;
      return new Response(JSON.stringify({ error: "AI generation failed. Please try again in a moment." }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error("ai-blog-writer: unexpected Gemini response shape");
      return new Response(JSON.stringify({ error: "AI generation failed — no content returned by model." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean markdown codeblocks if model included them
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let article: { title?: string; excerpt?: string; content?: string; category?: string };
    try {
      article = JSON.parse(rawText);
    } catch (jsonErr) {
      console.error("ai-blog-writer: JSON parse error", (jsonErr as Error)?.message);
      article = { title: topic, excerpt: "", content: rawText, category: "General Health" };
    }

    return new Response(JSON.stringify(article), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-blog-writer error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
