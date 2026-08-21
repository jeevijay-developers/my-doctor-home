import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { topic, doctorName, specialization } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY secret is not set in Supabase Edge Function Secrets." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a medical content writer for an Indian doctor's website. Write professional, patient-friendly health articles. The doctor is ${doctorName || "a doctor"}, specializing in ${specialization || "general medicine"}.

Rules:
- Write in clear, simple English that Indian patients can understand
- Include practical advice and actionable tips
- Be medically accurate but avoid overly technical jargon
- Add a disclaimer: "This article is for educational purposes only. Always consult your doctor for personalized advice."
- Structure with proper headings using ## and ### markdown
- Keep articles concise, engaging, and patient-friendly (300-500 words)
- Be warm and reassuring in tone`;

    const GEMINI_TIMEOUT_MS = 40_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    // Active Gemini models for this API key
    const modelCandidates = ["gemini-2.5-flash", "gemini-2.0-flash"];
    const attempts: Array<{ model: string; status: number; text: string }> = [];
    let geminiData: any = null;

    for (const model of modelCandidates) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1200));
        }
        try {
          const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
      let mainError = lastAttempt?.text || "AI generation failed";
      try {
        const json = JSON.parse(mainError);
        if (json.error?.message) mainError = json.error.message;
      } catch (_) {}

      return new Response(JSON.stringify({
        error: mainError,
        attempts: attempts.map(a => `${a.model} (${a.status}): ${a.text}`)
      }), {
        status: lastAttempt?.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error("ai-blog-writer: unexpected Gemini response shape", JSON.stringify(geminiData));
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
      console.error("ai-blog-writer: JSON parse error", jsonErr, rawText);
      article = { title: topic, excerpt: "", content: rawText, category: "General Health" };
    }

    return new Response(JSON.stringify(article), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-blog-writer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
