// doctylia-razorpay-design.md §2/§5 #6 — Doctor saves bank or UPI payout
// details from the Earnings dashboard. Details are always persisted so the
// doctor's setup isn't lost; if RazorpayX Contact/Fund Account keys are
// configured we also link them to Razorpay so create-doctor-payout can pay
// out immediately once approved. Without keys, it's saved as unverified/
// unlinked and payouts stay blocked until the platform team finishes setup.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAZORPAYX_KEY_ID = Deno.env.get("RAZORPAYX_KEY_ID");
const RAZORPAYX_KEY_SECRET = Deno.env.get("RAZORPAYX_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function razorpayxFetch(path: string, body: unknown) {
  const basicAuth = btoa(`${RAZORPAYX_KEY_ID}:${RAZORPAYX_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || `RazorpayX ${path} failed`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return json(401, { error: "Invalid token" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const { account_holder_name, account_number, ifsc, upi_id } = body || {};
  const hasBank = Boolean(account_number && ifsc);
  const hasUpi = Boolean(upi_id);
  if (!hasBank && !hasUpi) return json(400, { error: "Provide either account_number + ifsc, or upi_id" });

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", uid).maybeSingle();

  const record: Record<string, unknown> = {
    doctor_id: uid,
    account_holder_name: account_holder_name || profile?.full_name || null,
    account_number: hasBank ? account_number : null,
    ifsc: hasBank ? ifsc.toUpperCase() : null,
    upi_id: hasUpi ? upi_id : null,
    verified: false,
    razorpay_contact_id: null,
    razorpay_fund_account_id: null,
  };

  if (RAZORPAYX_KEY_ID && RAZORPAYX_KEY_SECRET) {
    try {
      const contact = await razorpayxFetch("/contacts", {
        name: record.account_holder_name || "Doctor",
        type: "vendor",
        reference_id: uid,
      });
      const fundAccount = hasBank
        ? await razorpayxFetch("/fund_accounts", {
            contact_id: contact.id,
            account_type: "bank_account",
            bank_account: { name: record.account_holder_name, ifsc, account_number },
          })
        : await razorpayxFetch("/fund_accounts", {
            contact_id: contact.id,
            account_type: "vpa",
            vpa: { address: upi_id },
          });
      record.razorpay_contact_id = contact.id;
      record.razorpay_fund_account_id = fundAccount.id;
      record.verified = true; // linked to Razorpay; not the same as bank penny-drop verification
    } catch (e) {
      console.error("add-doctor-bank-account Razorpay link failed:", (e as Error).message);
      // Still save the raw details below so the doctor doesn't lose their input.
    }
  }

  const { data: saved, error } = await admin
    .from("doctor_bank_accounts")
    .upsert(record, { onConflict: "doctor_id" })
    .select("id, verified, razorpay_fund_account_id")
    .single();
  if (error) return json(500, { error: error.message });

  return json(200, {
    ok: true,
    verified: saved.verified,
    linked_to_razorpay: Boolean(saved.razorpay_fund_account_id),
    note: saved.razorpay_fund_account_id
      ? undefined
      : "Saved. Payout linking is pending — the Doctylia team needs to configure RazorpayX before payouts can be sent.",
  });
});
