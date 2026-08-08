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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a medical content writer for an Indian doctor's website. Write professional, patient-friendly health articles. The doctor is ${doctorName || "a doctor"}, specializing in ${specialization || "general medicine"}.

Rules:
- Write in clear, simple English that Indian patients can understand
- Include practical advice and actionable tips
- Be medically accurate but avoid overly technical jargon
- Add a disclaimer: "This article is for educational purposes only. Always consult your doctor for personalized advice."
- Structure with proper headings using ## and ### markdown
- Keep articles between 800-1200 words
- Be warm and reassuring in tone`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write a health blog article about: "${topic}". Return a JSON object with keys: title, excerpt (1-2 sentences), content (full article in markdown), category (one of: General Health, Heart Health, Diabetes, Skin Care, Mental Health, Nutrition, Fitness, Women's Health, Children's Health, Prevention).` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_blog_post",
              description: "Create a structured blog post",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Article title" },
                  excerpt: { type: "string", description: "1-2 sentence summary" },
                  content: { type: "string", description: "Full article content in markdown" },
                  category: { type: "string", description: "Article category" },
                },
                required: ["title", "excerpt", "content", "category"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_blog_post" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const article = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(article), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to extract from content
    const content = data.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({
      title: topic,
      excerpt: "",
      content,
      category: "General Health",
    }), {
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
