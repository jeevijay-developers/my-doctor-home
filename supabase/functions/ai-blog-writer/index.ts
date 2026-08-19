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

    const { data: isPremium } = await admin.rpc("doctor_has_premium_access", { _doctor_id: doctorId });
    if (!isPremium) {
      return new Response(JSON.stringify({ error: "AI Blog Writer is a Premium-only feature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, doctorName, specialization } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const systemPrompt = `You are a medical content writer for an Indian doctor's website. Write professional, patient-friendly health articles. The doctor is ${doctorName || "a doctor"}, specializing in ${specialization || "general medicine"}.

Rules:
- Write in clear, simple English that Indian patients can understand
- Include practical advice and actionable tips
- Be medically accurate but avoid overly technical jargon
- Add a disclaimer: "This article is for educational purposes only. Always consult your doctor for personalized advice."
- Structure with proper headings using ## and ### markdown
- Keep articles between 800-1200 words
- Be warm and reassuring in tone`;

    const GEMINI_TIMEOUT_MS = 40_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.7-flash",
          system_instruction: systemPrompt,
          input: `Write a health blog article about: "${topic}". Return a JSON object with keys: title, excerpt (1-2 sentences), content (full article in markdown), category (one of: General Health, Heart Health, Diabetes, Skin Care, Mental Health, Nutrition, Fitness, Women's Health, Children's Health, Prevention).`,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Article title" },
                excerpt: { type: "string", description: "1-2 sentence summary" },
                content: { type: "string", description: "Full article content in markdown" },
                category: { type: "string", description: "Article category" },
              },
              required: ["title", "excerpt", "content", "category"],
            },
          },
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof Error && fetchErr.name === "AbortError";
      console.error("ai-blog-writer: Gemini request failed", isTimeout ? "timed out" : fetchErr);
      return new Response(JSON.stringify({
        error: isTimeout
          ? "AI generation timed out. Please try again."
          : "AI generation is temporarily unavailable. Please try again shortly.",
      }), {
        status: isTimeout ? 504 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("Gemini API error:", status, text);
      const isTransientProviderIssue = status === 429 || status === 402 || status >= 500
        || /quota|billing|high demand|overloaded|try again later/i.test(text);
      return new Response(JSON.stringify({
        error: isTransientProviderIssue
          ? "AI generation is temporarily unavailable. Please try again shortly."
          : "AI generation failed. Please try again.",
      }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: {
      output_text?: string;
      steps?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    };
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error("ai-blog-writer: failed to parse Gemini response as JSON", parseErr);
      return new Response(JSON.stringify({ error: "AI generation failed. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outputText = data.output_text;
    let article: { title?: string; excerpt?: string; content?: string; category?: string } | undefined;

    if (outputText) {
      try {
        article = JSON.parse(outputText);
      } catch (parseErr) {
        console.error("ai-blog-writer: failed to parse Gemini output_text as JSON", parseErr, outputText);
      }
    }

    if (!article) {
      // Fallback: try to extract from the raw steps content
      const content = data.steps?.find((s: { type: string }) => s.type === "model_output")
        ?.content?.find((c: { type: string }) => c.type === "text")?.text;
      if (content) {
        article = { title: topic, excerpt: "", content, category: "General Health" };
      }
    }

    if (!article?.content) {
      console.error("ai-blog-writer: unexpected Gemini response shape", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI generation failed — no content was returned. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
