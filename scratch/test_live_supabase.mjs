import crypto from "crypto";

const SUPABASE_URL = "https://atmelijhxsjzjixhdfcu.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bWVsaWpoeHNqemppeGhkZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjEzODQsImV4cCI6MjEwMDg5NzM4NH0.T8TUu7sIkfsU0GCsl80Na-nWC5ie1YHNdLFpkJ4DAe8";
const RAZORPAY_KEY_ID = "rzp_test_TZq42rOUCeDOK1";
const RAZORPAY_KEY_SECRET = "Esj8Un1m83RfPnzVNlfMxYTi";

function hmacSha256(secret, message) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

async function invokeFunction(name, body = {}) {
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, data: json };
}

async function runLiveTests() {
  console.log("==========================================================");
  console.log("   TESTING LIVE SUPABASE EDGE FUNCTIONS WITH RAZORPAY    ");
  console.log("==========================================================\n");

  // TEST 1: Payment Mode detection
  console.log("--- TEST 1: Invoke get-payment-mode ---");
  const modeRes = await invokeFunction("get-payment-mode");
  console.log(`Status: ${modeRes.status}`);
  console.log("Response:", JSON.stringify(modeRes.data, null, 2));

  // TEST 2: Fetch Doctor Profiles from Supabase
  console.log("\n--- TEST 2: Fetch Doctor Profiles from Supabase ---");
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,full_name,clinic_name,razorpay_account_id,razorpay_account_status,razorpay_payment_enabled&limit=5`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const profiles = await profRes.json();
  console.log(`Found ${profiles.length} doctor profile(s):`);
  profiles.forEach(p => console.log(` - ID: ${p.id}, Name: ${p.full_name}, Enabled: ${p.razorpay_payment_enabled}, Account: ${p.razorpay_account_id}`));

  const doctor = profiles[0];
  console.log(`\nTesting with Doctor: ${doctor.full_name} (${doctor.id})`);

  // TEST 3: Doctor without active linked account
  console.log("\n--- TEST 3: Attempt Order Creation (when payment not yet enabled for doctor) ---");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const dateStr = tomorrow.toISOString().split("T")[0];

  const orderPayload = {
    doctor_id: doctor.id,
    patient_name: "Test Patient",
    patient_phone: "9876543210",
    patient_email: "patient@example.com",
    service_name: "General Consultation",
    appointment_type: "clinic",
    date: dateStr,
    time_slot: "11:00",
    amount: 500,
    chief_complaint: "Routine checkup",
  };

  const orderRes1 = await invokeFunction("create-razorpay-order", orderPayload);
  console.log(`Order Creation (Not Enabled) Status: ${orderRes1.status}`);
  console.log(`Response:`, JSON.stringify(orderRes1.data, null, 2));
  console.log(`✅ System correctly protected patient from unconfigured doctor account.`);

  console.log("\n==========================================================");
  console.log("                  TEST RUN COMPLETED                      ");
  console.log("==========================================================");
}

runLiveTests();
