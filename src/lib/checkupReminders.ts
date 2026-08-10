// Shared constants + date math for the Regular Checkup Reminder feature.
// The date math here is duplicated (not imported) from
// supabase/functions/_shared/checkupSchedule.ts — edge functions run on
// Deno and can't import from src/, per this repo's established
// cross-runtime convention. Keep both copies in sync.
import type { Database } from "@/integrations/supabase/types";

export type Frequency = Database["public"]["Enums"]["checkup_frequency"];
export type ReminderStatus = Database["public"]["Enums"]["reminder_status"];
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];
export type NotificationStatus = Database["public"]["Enums"]["notification_status"];

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "every_15_days", label: "Every 15 Days" },
  { value: "monthly", label: "Monthly" },
  { value: "every_3_months", label: "Every 3 Months" },
  { value: "every_6_months", label: "Every 6 Months" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

export const FREQUENCY_LABEL: Record<Frequency, string> = Object.fromEntries(
  FREQUENCY_OPTIONS.map((f) => [f.value, f.label])
) as Record<Frequency, string>;

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addFrequency(dateStr: string, frequency: Frequency, customIntervalDays: number | null): string {
  const d = parseDateOnly(dateStr);
  switch (frequency) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "every_15_days": d.setUTCDate(d.getUTCDate() + 15); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "every_3_months": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "every_6_months": d.setUTCMonth(d.getUTCMonth() + 6); break;
    case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    case "custom": d.setUTCDate(d.getUTCDate() + (customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30)); break;
  }
  return formatDateOnly(d);
}

export function subtractDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return formatDateOnly(d);
}

export function computeNextReminderDate(nextCheckupDate: string, reminderBeforeDays: number): string {
  return subtractDays(nextCheckupDate, reminderBeforeDays);
}

export const STATUS_LABEL: Record<ReminderStatus, string> = {
  active: "Active", paused: "Paused", completed: "Completed", cancelled: "Cancelled",
};
export const STATUS_CLASS: Record<ReminderStatus, string> = {
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  pending: "Pending", processing: "Processing", sent: "Sent", failed: "Failed", simulated: "Simulated",
};
export const NOTIFICATION_STATUS_CLASS: Record<NotificationStatus, string> = {
  pending: "bg-warning/10 text-warning",
  processing: "bg-royal/10 text-royal",
  sent: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  simulated: "bg-ai-purple/10 text-ai-purple",
};

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  whatsapp: "WhatsApp", sms: "SMS", in_app: "In-App",
};
