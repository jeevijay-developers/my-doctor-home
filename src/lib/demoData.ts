// Demo mode for sales demos / UI previews of the superadmin panel.
// Purely client-side and static: nothing is read from or written to Supabase.
// Enable with `?demo=1` (kept for the browser tab session), disable with `?demo=0`,
// or build with VITE_DEMO_MODE=true.

const KEY = "doctylia_demo_mode";

export const isDemoMode = (): boolean => {
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    if (sessionStorage.getItem(KEY) === "1") return true;
  } catch {
    /* storage unavailable */
  }
  return import.meta.env.VITE_DEMO_MODE === "true";
};

// Small deterministic PRNG so the demo data is identical on every render.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const demoOverview = () => {
  const now = new Date();
  const counts = [6, 9, 14, 19, 27, 36, 48]; // steady growth, 7 months
  const chart = counts.map((count, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (counts.length - 1 - i), 1);
    return { month: monthKey(d), count };
  });
  const trialEnd = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
  return {
    stats: { totalDoctors: 159, trials: 14, active: 118, expired: 27, appointments: 6842, revenue: 462350 },
    chart,
    trialsEnding: [
      { id: "demo-1", full_name: "Dr. Ananya Sharma", clinic_name: "Sharma Dental Care", trial_end: trialEnd(2) },
      { id: "demo-2", full_name: "Dr. Rohit Mehta", clinic_name: "Mehta Skin Clinic", trial_end: trialEnd(4) },
      { id: "demo-3", full_name: "Dr. Kavita Nair", clinic_name: "Nair Women's Health", trial_end: trialEnd(6) },
    ],
  };
};

const NAMES = [
  "Dr. Ananya Sharma", "Dr. Rohit Mehta", "Dr. Kavita Nair", "Dr. Imran Qureshi", "Dr. Priya Desai",
  "Dr. Sandeep Joshi", "Dr. Neha Kulkarni", "Dr. Arjun Reddy", "Dr. Meera Iyer", "Dr. Vikram Singh",
  "Dr. Pooja Bansal", "Dr. Faisal Khan", "Dr. Shweta Patil", "Dr. Karan Malhotra", "Dr. Lakshmi Menon",
];

export const demoPayments = () => {
  const rand = rng(42);
  const now = Date.now();
  const rows: {
    id: string; doctor_id: string; from_tier: string; target_tier: string; amount: number;
    status: "captured" | "created" | "failed" | "refunded" | "abandoned"; is_mock: boolean; created_at: string;
    profiles: { full_name: string | null; clinic_name: string | null } | null;
  }[] = [];
  // ~110 payments over the last 60 days, more recent ones denser => visible growth.
  for (let i = 0; i < 110; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 60);
    const premium = rand() > 0.45;
    const roll = rand();
    const status = roll < 0.82 ? "captured" : roll < 0.88 ? "created" : roll < 0.92 ? "failed" : roll < 0.95 ? "refunded" : "abandoned";
    const hourOffset = Math.floor(rand() * 10) * 3600000;
    rows.push({
      id: `demo-pay-${i}`,
      doctor_id: `demo-doc-${i % NAMES.length}`,
      from_tier: premium && rand() > 0.5 ? "pro" : "free",
      target_tier: premium ? "premium" : "pro",
      amount: premium ? 3999 : 1499,
      status,
      is_mock: false,
      created_at: new Date(now - daysAgo * 86400000 - hourOffset).toISOString(),
      profiles: { full_name: NAMES[i % NAMES.length], clinic_name: null },
    });
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const DEMO_ESTIMATED_MRR = 318450;
