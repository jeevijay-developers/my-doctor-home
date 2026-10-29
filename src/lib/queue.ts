// Pure helpers for the live queue (see supabase/migrations/*_live_queue.sql, which
// holds the authoritative rules — the database orders and mutates the line; this
// file only mirrors the ordering so the screen can render it).

export type QueueAppointment = {
  id: string;
  patient_name: string;
  service_name: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  amount: number;
  time_slot: string | null;
  sort_time: string;
  created_at: string;
  queue_number: number | null;
  serving_started_at: string | null;
  skipped_at: string | null;
  completed_at: string | null;
  priority: number;
  priority_reason: string | null;
  appointment_type: string;
};

export type QueueState = "serving" | "waiting" | "skipped" | "done" | "cancelled" | "no_show";

const OPEN_STATUSES = new Set(["pending", "confirmed"]);

export function queueStateOf(a: Pick<QueueAppointment, "status" | "serving_started_at" | "skipped_at">): QueueState {
  if (a.status === "completed") return "done";
  if (a.status === "cancelled") return "cancelled";
  if (a.status === "no_show") return "no_show";
  if (!OPEN_STATUSES.has(a.status)) return "waiting";
  if (a.serving_started_at) return "serving";
  if (a.skipped_at) return "skipped";
  return "waiting";
}

// Same order as the database: priority first, then arrival/slot time, then creation.
export function compareWaiting(a: QueueAppointment, b: QueueAppointment): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.sort_time !== b.sort_time) return a.sort_time < b.sort_time ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

// "HH:MM" bounds, both optional. Compares against the "HH:MM:SS" sort_time.
export function inTimeWindow(sortTime: string, from: string, to: string): boolean {
  const t = sortTime.slice(0, 5);
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

export type SplitQueue = {
  serving: QueueAppointment | null;
  waiting: QueueAppointment[];
  skipped: QueueAppointment[];
  done: QueueAppointment[];
  closed: number; // cancelled + no-show
};

export function splitQueue(list: QueueAppointment[], from = "", to = ""): SplitQueue {
  const scoped = list.filter((a) => inTimeWindow(a.sort_time, from, to) || queueStateOf(a) === "serving");
  const out: SplitQueue = { serving: null, waiting: [], skipped: [], done: [], closed: 0 };
  for (const a of scoped) {
    switch (queueStateOf(a)) {
      case "serving": out.serving = a; break;
      case "waiting": out.waiting.push(a); break;
      case "skipped": out.skipped.push(a); break;
      case "done": out.done.push(a); break;
      default: out.closed += 1;
    }
  }
  out.waiting.sort(compareWaiting);
  out.skipped.sort(compareWaiting);
  out.done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return out;
}

// Average consultation length in minutes from the most recent finished visits.
export function averageConsultMinutes(done: QueueAppointment[], sample = 10): number | null {
  const lengths = done
    .filter((a) => a.serving_started_at && a.completed_at)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, sample)
    .map((a) => (new Date(a.completed_at!).getTime() - new Date(a.serving_started_at!).getTime()) / 60000)
    .filter((m) => m > 0);
  if (lengths.length === 0) return null;
  return Math.round((lengths.reduce((s, m) => s + m, 0) / lengths.length) * 10) / 10;
}

export function estimateWaitMinutes(patientsAhead: number, avgMinutes: number | null, servingNow = false): number | null {
  if (avgMinutes == null) return null;
  return Math.round((patientsAhead + (servingNow ? 0.5 : 0)) * avgMinutes);
}

export function formatWait(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Money is settled once paid, or when it is explicitly pay-at-clinic (handled at completion).
export function isUnpaid(a: Pick<QueueAppointment, "payment_status">): boolean {
  return a.payment_status === "pending" || a.payment_status === "pay_at_clinic";
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
] as const;

export const QUEUE_ERRORS: Record<string, string> = {
  FORBIDDEN: "You don't have permission to run the queue.",
  NOT_AUTHENTICATED: "Please sign in again.",
  NOT_FOUND: "That appointment is no longer in your queue.",
  NOT_CALLABLE: "Only today's waiting patients can be called.",
  NOT_COMPLETABLE: "This appointment is already closed.",
  NOT_SKIPPABLE: "This appointment is already closed.",
  NOT_MARKABLE: "This appointment is already closed.",
  NOT_PRIORITISABLE: "This appointment is already closed.",
  REASON_REQUIRED: "Please give a reason — patients can see the order change.",
  PAYMENT_METHOD_REQUIRED: "Choose how the patient paid.",
  ALREADY_SETTLED: "This payment is already settled.",
};

export function queueErrorMessage(code: string | undefined): string {
  return (code && QUEUE_ERRORS[code]) || "Could not update the queue. Please try again.";
}

// Today's date in the clinic's time zone (IST), as yyyy-MM-dd, whatever the browser's zone is.
export function clinicToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
