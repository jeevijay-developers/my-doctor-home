// Zoom Server-to-Server OAuth integration
// Actions: create | get | update | delete
// Auth: doctor via Supabase JWT (Authorization header)
//       patient via { patient_token, patient_phone } in body
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZOOM_ACCOUNT_ID = Deno.env.get("ZOOM_ACCOUNT_ID");
const ZOOM_CLIENT_ID = Deno.env.get("ZOOM_CLIENT_ID");
const ZOOM_CLIENT_SECRET = Deno.env.get("ZOOM_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let cachedToken: { token: string; expiresAt: number } | null = null;
async function getZoomToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error("Zoom credentials not configured");
  }
  const basic = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${body.reason || res.statusText}`);
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

async function zoomFetch(path: string, init: RequestInit = {}) {
  const token = await getZoomToken();
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Zoom API ${res.status}: ${data?.message || text}`);
  return data;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function apptStartISO(date: string, time: string) {
  // Store IST but pass through Zoom as timezone Asia/Kolkata (start_time is TZ-naive).
  return `${date}T${time.length === 5 ? time + ":00" : time}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const { appointment_id, action, patient_token, patient_phone } = body as {
      appointment_id?: string;
      action?: "create" | "get" | "update" | "delete";
      patient_token?: string;
      patient_phone?: string;
    };
    if (!appointment_id || !action) return json(400, { error: "appointment_id and action are required" });

    // Load appointment (service role bypasses RLS).
    const { data: appt, error: apptErr } = await admin
      .from("appointments")
      .select("id, doctor_id, patient_phone, token_number, appointment_type, date, time_slot, service_name, status, zoom_meeting_id, zoom_join_url, zoom_start_url")
      .eq("id", appointment_id)
      .maybeSingle();
    if (apptErr) return json(500, { error: apptErr.message });
    if (!appt) return json(404, { error: "Appointment not found" });

    // Authorization
    let role: "doctor" | "patient" | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: claims } = await scoped.auth.getClaims(jwt);
      const uid = claims?.claims?.sub as string | undefined;
      if (uid && uid === appt.doctor_id) role = "doctor";
    }
    if (!role && patient_token && patient_phone) {
      if (patient_token === appt.token_number && patient_phone === appt.patient_phone) {
        role = "patient";
      }
    }
    if (!role) return json(403, { error: "Not authorized for this appointment" });

    // Only doctors can create/update/delete
    if (role === "patient" && action !== "get") {
      return json(403, { error: "Only the doctor can manage the meeting" });
    }

    if (appt.appointment_type !== "online") {
      return json(400, { error: "This appointment is not an online consultation" });
    }

    if (action === "create") {
      if (appt.zoom_join_url && appt.zoom_meeting_id) {
        return json(200, {
          meeting_id: appt.zoom_meeting_id,
          join_url: appt.zoom_join_url,
          start_url: appt.zoom_start_url,
        });
      }
      const meeting = await zoomFetch(`/users/me/meetings`, {
        method: "POST",
        body: JSON.stringify({
          topic: `${appt.service_name} - Consultation`,
          type: 2,
          start_time: apptStartISO(appt.date, appt.time_slot),
          duration: 30,
          timezone: "Asia/Kolkata",
          settings: {
            join_before_host: true,
            waiting_room: false,
            approval_type: 2,
            audio: "both",
          },
        }),
      });
      await admin
        .from("appointments")
        .update({
          zoom_meeting_id: String(meeting.id),
          zoom_join_url: meeting.join_url,
          zoom_start_url: meeting.start_url,
          meeting_link: meeting.join_url,
          meeting_provider: "zoom",
          meeting_status: "scheduled",
        })
        .eq("id", appointment_id);
      return json(200, {
        meeting_id: String(meeting.id),
        join_url: meeting.join_url,
        start_url: meeting.start_url,
      });
    }

    if (action === "get") {
      if (!appt.zoom_join_url) return json(404, { error: "No Zoom meeting yet" });
      if (role === "doctor") {
        return json(200, {
          meeting_id: appt.zoom_meeting_id,
          join_url: appt.zoom_join_url,
          start_url: appt.zoom_start_url,
        });
      }
      return json(200, { meeting_id: appt.zoom_meeting_id, join_url: appt.zoom_join_url });
    }

    if (action === "update") {
      if (!appt.zoom_meeting_id) return json(404, { error: "No Zoom meeting to update" });
      await zoomFetch(`/meetings/${appt.zoom_meeting_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          start_time: apptStartISO(appt.date, appt.time_slot),
          timezone: "Asia/Kolkata",
        }),
      });
      return json(200, { ok: true });
    }

    if (action === "delete") {
      if (appt.zoom_meeting_id) {
        try {
          await zoomFetch(`/meetings/${appt.zoom_meeting_id}`, { method: "DELETE" });
        } catch (e) {
          // Meeting may already be gone; continue.
          console.warn("Zoom delete warning:", (e as Error).message);
        }
      }
      await admin
        .from("appointments")
        .update({
          zoom_meeting_id: null,
          zoom_join_url: null,
          zoom_start_url: null,
          meeting_link: null,
          meeting_status: "cancelled",
        })
        .eq("id", appointment_id);
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    console.error("create-zoom-meeting error:", e);
    return json(500, { error: (e as Error).message || "Internal error" });
  }
});
