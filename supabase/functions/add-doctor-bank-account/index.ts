// doctylia-razorpay-design.md §2/§5 #6 — Doctor saves bank or UPI payout
// details from Profile → Clinic Details → Bank/UPI Setup. Details are always
// persisted so the doctor's setup isn't lost; if RazorpayX Contact/Fund
// Account keys are configured (live mode) we also link them to Razorpay so
// create-doctor-payout can pay out immediately once approved.
//
// Mock mode (mock-payment-mode-testing-prompt.md, Part 6): with no
// RAZORPAYX keys configured this resolves to mock automatically — linking is
// simulated (fake contact/fund-account ids, verified=true, is_mock=true) so
// doctor-side payout/settlement UI can be tested end-to-end today without
// waiting on real RazorpayX activation.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAYX_KEY_ID = Deno.env.get("RAZORPAYX_KEY_ID");
const RAZORPAYX_KEY_SECRET = Deno.env.get("RAZORPAYX_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Kept in sync with src/lib/bankDetails.ts (Deno edge functions run in a
// separate runtime/bundle from the Vite app, so these can't be imported —
// duplicated intentionally, same as this project's phone-validation pattern).
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^\d{6,20}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

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

  // Authoritative format checks — the client validates the same rules for
  // instant feedback, but a request could reach this function directly.
  if (hasBank) {
    if (!ACCOUNT_NUMBER_REGEX.test(String(account_number).trim())) {
      return json(400, { error: "Enter a valid bank account number (6–20 digits, numbers only)." });
    }
    if (!IFSC_REGEX.test(String(ifsc).trim().toUpperCase())) {
      return json(400, { error: "Enter a valid IFSC code, e.g. HDFC0001234 (4 letters + 0 + 6 alphanumeric characters)." });
    }
  }
  if (hasUpi && !UPI_REGEX.test(String(upi_id).trim())) {
    return json(400, { error: "Enter a valid UPI ID, e.g. yourname@okhdfcbank." });
  }

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
    is_mock: false,
  };

  const hasLiveKeys = Boolean(RAZORPAYX_KEY_ID && RAZORPAYX_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  if (mode === "mock") {
    // Simulated linking — no RazorpayX call, no real KYC. Lets doctor-side
    // payout/settlement UI be tested end-to-end without waiting on real
    // RazorpayX activation.
    record.razorpay_contact_id = mockId("contact");
    record.razorpay_fund_account_id = mockId("fa");
    record.verified = true;
    record.is_mock = true;
  } else if (hasLiveKeys) {
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
  // else: live mode requested but no keys configured — save unlinked/pending,
  // same fallback as before this feature existed.

  const { data: saved, error } = await admin
    .from("doctor_bank_accounts")
    .upsert(record, { onConflict: "doctor_id" })
    .select("id, verified, razorpay_fund_account_id, is_mock")
    .single();
  if (error) return json(500, { error: error.message });

  return json(200, {
    ok: true,
    verified: saved.verified,
    linked_to_razorpay: Boolean(saved.razorpay_fund_account_id),
    is_mock: saved.is_mock,
    note: saved.is_mock
      ? "Saved and linked in TEST MODE (mock RazorpayX — no real bank/KYC check happened)."
      : saved.razorpay_fund_account_id
      ? undefined
      : "Saved. Payout linking is pending — the Doctylia team needs to configure RazorpayX before payouts can be sent.",
  });
});
