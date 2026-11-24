// Display rules for the patient's "My appointment" page (src/pages/ManageAppointment.tsx).

const METHOD_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", online: "Online" };

export type PaymentSummary = { label: string; tone: "good" | "warn" | "neutral" };

type PaymentLike = {
  payment_status?: string | null;
  payment_method?: string | null;
  gateway_payment_id?: string | null;
  amount?: number | null;
};

/**
 * How the visit is paid, in the patient's words. Null when the server did not say
 * (a database older than the payment-details lookup), so nothing is guessed.
 */
export function paymentSummary(appt: PaymentLike): PaymentSummary | null {
  const amount = Number(appt.amount) > 0 ? ` · ₹${Number(appt.amount)}` : "";
  switch (appt.payment_status) {
    case "paid": {
      if (appt.gateway_payment_id) return { label: `Paid online${amount}`, tone: "good" };
      const method = appt.payment_method ? METHOD_LABELS[appt.payment_method] ?? appt.payment_method : "";
      return { label: `Paid at the clinic${method ? ` (${method})` : ""}${amount}`, tone: "good" };
    }
    case "pay_at_clinic":
      return { label: `Pay at the clinic${amount}`, tone: "neutral" };
    case "pending":
      return { label: `Payment pending${amount}`, tone: "warn" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
    default:
      return null;
  }
}

/** "14:30" / "14:30:00" -> "2:30 PM"; "" for walk-ins with no time. */
export function slotTimeLabel(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Rough wait from the queue numbers; null when the clinic has no average yet. */
export function queueWaitMinutes(q: { ahead?: number | null; now_serving?: number | null; avg_minutes?: number | null }): number | null {
  if (q.avg_minutes == null || q.ahead == null) return null;
  return Math.max(1, Math.round((q.ahead + (q.now_serving != null ? 0.5 : 0)) * q.avg_minutes));
}
