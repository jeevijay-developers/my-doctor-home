import { describe, expect, it } from "vitest";
import {
  averageConsultMinutes,
  clinicToday,
  compareWaiting,
  estimateWaitMinutes,
  formatWait,
  inTimeWindow,
  isUnpaid,
  queueErrorMessage,
  queueStateOf,
  splitQueue,
  type QueueAppointment,
} from "./queue";

const appt = (over: Partial<QueueAppointment>): QueueAppointment => ({
  id: "a",
  patient_name: "P",
  service_name: "Visit",
  status: "pending",
  payment_status: "pending",
  payment_method: null,
  amount: 300,
  time_slot: null,
  sort_time: "21:00:00",
  created_at: "2026-10-28T15:30:00Z",
  queue_number: 1,
  serving_started_at: null,
  skipped_at: null,
  completed_at: null,
  priority: 0,
  priority_reason: null,
  appointment_type: "clinic",
  ...over,
});

describe("queueStateOf", () => {
  it("derives the state from status and queue columns", () => {
    expect(queueStateOf(appt({}))).toBe("waiting");
    expect(queueStateOf(appt({ status: "confirmed" }))).toBe("waiting");
    expect(queueStateOf(appt({ serving_started_at: "2026-10-28T16:00:00Z" }))).toBe("serving");
    expect(queueStateOf(appt({ skipped_at: "2026-10-28T16:00:00Z" }))).toBe("skipped");
    expect(queueStateOf(appt({ status: "completed", serving_started_at: "2026-10-28T16:00:00Z" }))).toBe("done");
    expect(queueStateOf(appt({ status: "cancelled" }))).toBe("cancelled");
    expect(queueStateOf(appt({ status: "no_show" }))).toBe("no_show");
  });
});

describe("compareWaiting", () => {
  it("puts priority first, then arrival time, then creation order", () => {
    const early = appt({ id: "early", sort_time: "21:00:00" });
    const late = appt({ id: "late", sort_time: "21:10:00" });
    const urgent = appt({ id: "urgent", sort_time: "21:30:00", priority: 1 });
    const sameTimeLater = appt({ id: "same", sort_time: "21:00:00", created_at: "2026-10-28T15:30:05Z" });
    const ids = [late, urgent, sameTimeLater, early].sort(compareWaiting).map((a) => a.id);
    expect(ids).toEqual(["urgent", "early", "same", "late"]);
  });

  it("orders rows created at the same instant by id, the way the database does", () => {
    const b = appt({ id: "b" });
    const a = appt({ id: "a" });
    const c = appt({ id: "c" });
    expect([c, b, a].sort(compareWaiting).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("splitQueue", () => {
  const list = [
    appt({ id: "1", queue_number: 1, status: "completed", serving_started_at: "2026-10-28T15:00:00Z", completed_at: "2026-10-28T15:10:00Z" }),
    appt({ id: "2", queue_number: 2, serving_started_at: "2026-10-28T15:10:00Z", sort_time: "21:05:00" }),
    appt({ id: "3", queue_number: 3, sort_time: "21:10:00" }),
    appt({ id: "4", queue_number: 4, sort_time: "21:15:00", skipped_at: "2026-10-28T15:20:00Z" }),
    appt({ id: "5", queue_number: 5, status: "no_show", sort_time: "21:20:00" }),
    appt({ id: "6", queue_number: 6, sort_time: "21:25:00", priority: 1, priority_reason: "Chest pain" }),
  ];

  it("separates serving, waiting, skipped, done and closed", () => {
    const s = splitQueue(list);
    expect(s.serving?.id).toBe("2");
    expect(s.waiting.map((a) => a.id)).toEqual(["6", "3"]);
    expect(s.skipped.map((a) => a.id)).toEqual(["4"]);
    expect(s.done.map((a) => a.id)).toEqual(["1"]);
    expect(s.closed).toBe(1);
  });

  it("filters by time window but always keeps whoever is being seen", () => {
    const s = splitQueue(list, "21:08", "21:20");
    expect(s.serving?.id).toBe("2");
    expect(s.waiting.map((a) => a.id)).toEqual(["3"]);
  });
});

describe("inTimeWindow", () => {
  it("treats empty bounds as open", () => {
    expect(inTimeWindow("21:00:00", "", "")).toBe(true);
    expect(inTimeWindow("21:00:00", "21:01", "")).toBe(false);
    expect(inTimeWindow("21:00:00", "", "20:59")).toBe(false);
    expect(inTimeWindow("21:00:00", "21:00", "21:00")).toBe(true);
  });
});

describe("wait estimates", () => {
  it("averages recent consultations and estimates the wait", () => {
    const done = [
      appt({ status: "completed", serving_started_at: "2026-10-28T15:00:00Z", completed_at: "2026-10-28T15:10:00Z" }),
      appt({ status: "completed", serving_started_at: "2026-10-28T15:10:00Z", completed_at: "2026-10-28T15:30:00Z" }),
    ];
    expect(averageConsultMinutes(done)).toBe(15);
    expect(estimateWaitMinutes(4, 15)).toBe(60);
    expect(estimateWaitMinutes(0, 15, true)).toBe(8);
    expect(estimateWaitMinutes(3, null)).toBeNull();
    expect(averageConsultMinutes([])).toBeNull();
  });

  it("formats waits", () => {
    expect(formatWait(null)).toBe("—");
    expect(formatWait(0)).toBe("less than a minute");
    expect(formatWait(45)).toBe("45 min");
    expect(formatWait(60)).toBe("1h");
    expect(formatWait(135)).toBe("2h 15m");
  });
});

describe("helpers", () => {
  it("knows what is unpaid", () => {
    expect(isUnpaid({ payment_status: "pending" })).toBe(true);
    expect(isUnpaid({ payment_status: "pay_at_clinic" })).toBe(true);
    expect(isUnpaid({ payment_status: "paid" })).toBe(false);
  });

  it("maps server error codes to readable messages", () => {
    expect(queueErrorMessage("REASON_REQUIRED")).toMatch(/reason/i);
    expect(queueErrorMessage("SOMETHING_NEW")).toMatch(/try again/i);
    expect(queueErrorMessage(undefined)).toMatch(/try again/i);
  });

  it("computes the clinic's date in IST regardless of the machine zone", () => {
    // 20:00 UTC on 27 Oct is 01:30 IST on 28 Oct.
    expect(clinicToday(new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-28");
    expect(clinicToday(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-28");
  });
});
