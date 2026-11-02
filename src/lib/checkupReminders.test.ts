import { describe, expect, it } from "vitest";
import {
  CHANNEL_LABEL,
  FREQUENCY_LABEL,
  FREQUENCY_OPTIONS,
  NOTIFICATION_STATUS_CLASS,
  NOTIFICATION_STATUS_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  addFrequency,
  computeNextReminderDate,
  subtractDays,
} from "./checkupReminders";

describe("addFrequency", () => {
  it("adds fixed day intervals", () => {
    expect(addFrequency("2026-03-10", "weekly", null)).toBe("2026-03-17");
    expect(addFrequency("2026-03-10", "every_15_days", null)).toBe("2026-03-25");
  });
  it("crosses month and year boundaries for day-based intervals", () => {
    expect(addFrequency("2026-12-28", "weekly", null)).toBe("2027-01-04");
    expect(addFrequency("2026-02-20", "every_15_days", null)).toBe("2026-03-07");
    expect(addFrequency("2028-02-25", "weekly", null)).toBe("2028-03-03"); // leap year
    expect(addFrequency("2027-02-25", "weekly", null)).toBe("2027-03-04");
  });
  it("adds calendar months / years", () => {
    expect(addFrequency("2026-03-10", "monthly", null)).toBe("2026-04-10");
    expect(addFrequency("2026-12-15", "monthly", null)).toBe("2027-01-15");
    expect(addFrequency("2026-03-10", "every_3_months", null)).toBe("2026-06-10");
    expect(addFrequency("2026-11-10", "every_3_months", null)).toBe("2027-02-10");
    expect(addFrequency("2026-03-10", "every_6_months", null)).toBe("2026-09-10");
    expect(addFrequency("2026-09-10", "every_6_months", null)).toBe("2027-03-10");
    expect(addFrequency("2026-03-10", "yearly", null)).toBe("2027-03-10");
  });
  it("custom uses the interval, defaulting to 30 for null/0/negative", () => {
    expect(addFrequency("2026-03-10", "custom", 10)).toBe("2026-03-20");
    expect(addFrequency("2026-03-10", "custom", null)).toBe("2026-04-09");
    expect(addFrequency("2026-03-10", "custom", 0)).toBe("2026-04-09");
    expect(addFrequency("2026-03-10", "custom", -5)).toBe("2026-04-09");
  });
  it("always returns zero-padded YYYY-MM-DD", () => {
    expect(addFrequency("2026-01-01", "weekly", null)).toBe("2026-01-08");
  });

  it("monthly from Jan 31 clamps to the end of February", () => {
    expect(addFrequency("2026-01-31", "monthly", null)).toBe("2026-02-28");
  });
  it("every_3_months from Nov 30 clamps to the end of February", () => {
    expect(addFrequency("2026-11-30", "every_3_months", null)).toBe("2027-02-28");
  });
  it("yearly from Feb 29 clamps to Feb 28 in a non-leap year", () => {
    expect(addFrequency("2028-02-29", "yearly", null)).toBe("2029-02-28");
  });
});

describe("subtractDays / computeNextReminderDate", () => {
  it("subtracts across month and year boundaries", () => {
    expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28");
    expect(subtractDays("2028-03-01", 1)).toBe("2028-02-29");
    expect(subtractDays("2027-01-01", 1)).toBe("2026-12-31");
  });
  it("clamps negative days to 0 (never moves forward)", () => {
    expect(subtractDays("2026-03-10", -5)).toBe("2026-03-10");
    expect(subtractDays("2026-03-10", 0)).toBe("2026-03-10");
  });
  it("computeNextReminderDate is the checkup date minus lead days", () => {
    expect(computeNextReminderDate("2026-03-10", 3)).toBe("2026-03-07");
    expect(computeNextReminderDate("2026-03-02", 7)).toBe("2026-02-23");
  });
});

describe("label tables", () => {
  it("FREQUENCY_LABEL covers every option", () => {
    for (const o of FREQUENCY_OPTIONS) expect(FREQUENCY_LABEL[o.value]).toBe(o.label);
    expect(new Set(FREQUENCY_OPTIONS.map((o) => o.value)).size).toBe(FREQUENCY_OPTIONS.length);
  });
  it("status/channel tables have a non-empty entry for every key", () => {
    for (const t of [STATUS_LABEL, STATUS_CLASS, NOTIFICATION_STATUS_LABEL, NOTIFICATION_STATUS_CLASS, CHANNEL_LABEL]) {
      for (const v of Object.values(t)) expect(v.trim()).not.toBe("");
    }
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(Object.keys(STATUS_CLASS).sort());
    expect(Object.keys(NOTIFICATION_STATUS_LABEL).sort()).toEqual(Object.keys(NOTIFICATION_STATUS_CLASS).sort());
  });
});
