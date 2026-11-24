import { describe, expect, it, vi } from "vitest";
import { findNextAvailable, relativeDayLabel, slotLabel, type HoursRow } from "./nextAvailable";

// Monday 24 Nov 2026, browser-local time (the widget hides past slots by local clock).
const monday = (h: number, m = 0) => new Date(2026, 10, 23 + 1, h, m);

const hours: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day_of_week: d,
  is_open: d !== 0,
  start_time: "10:00:00",
  end_time: "12:00:00",
  start_time_2: null,
  end_time_2: null,
}));

describe("findNextAvailable", () => {
  it("returns the first future, unbooked slot today with a single lookup", async () => {
    const fetchCounts = vi.fn().mockResolvedValue({ "10:30": 1 });
    const result = await findNextAvailable({ workingHours: hours, slotMinutes: 30, now: monday(10, 5), fetchCounts });
    expect(result?.time).toBe("11:00");
    expect(result?.dateKey).toBe("2026-11-24");
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });

  it("moves to the next open day when today is over, skipping closed days without a lookup", async () => {
    const saturdayEvening = new Date(2026, 10, 28, 19, 0); // Sat; Sunday is closed
    const fetchCounts = vi.fn().mockResolvedValue({});
    const result = await findNextAvailable({ workingHours: hours, slotMinutes: 30, now: saturdayEvening, fetchCounts });
    expect(result?.dateKey).toBe("2026-11-30"); // Monday
    expect(result?.time).toBe("10:00");
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });

  it("skips fully booked days", async () => {
    const fetchCounts = vi.fn()
      .mockResolvedValueOnce({ "10:00": 1, "10:30": 1, "11:00": 1, "11:30": 1 })
      .mockResolvedValueOnce({});
    const result = await findNextAvailable({ workingHours: hours, slotMinutes: 30, now: monday(8), fetchCounts });
    expect(result?.dateKey).toBe("2026-11-25");
  });

  it("gives up (null) when nothing is free within the booking window", async () => {
    const full = { "10:00": 1, "10:30": 1, "11:00": 1, "11:30": 1 };
    const result = await findNextAvailable({ workingHours: hours, slotMinutes: 30, advanceDays: 3, now: monday(8), fetchCounts: async () => full });
    expect(result).toBeNull();
  });

  it("returns null without lookups when the clinic has no hours", async () => {
    const fetchCounts = vi.fn();
    expect(await findNextAvailable({ workingHours: [], now: monday(8), fetchCounts })).toBeNull();
    expect(fetchCounts).not.toHaveBeenCalled();
  });
});

describe("labels", () => {
  it("formats day and time", () => {
    const now = monday(8);
    expect(relativeDayLabel(monday(16), now)).toBe("Today");
    expect(relativeDayLabel(new Date(2026, 10, 25), now)).toBe("Tomorrow");
    expect(relativeDayLabel(new Date(2026, 10, 27), now)).toBe("Fri, 27 Nov");
    expect(slotLabel("16:30")).toBe("4:30 PM");
    expect(slotLabel("09:05")).toBe("9:05 AM");
  });
});
