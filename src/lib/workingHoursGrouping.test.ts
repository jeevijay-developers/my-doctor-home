import { describe, it, expect } from "vitest";
import { groupWorkingHours, formatDayRangeLabel, type WorkingHourLike } from "./workingHoursGrouping";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const day = (day_of_week: number, overrides: Partial<WorkingHourLike> = {}): WorkingHourLike => ({
  day_of_week,
  is_open: true,
  start_time: "09:00",
  end_time: "13:00",
  start_time_2: "17:00",
  end_time_2: "21:00",
  ...overrides,
});

describe("groupWorkingHours", () => {
  it("groups consecutive days with identical schedules, keeping a differing day separate", () => {
    const schedule = [
      day(0, { is_open: false, start_time: null, end_time: null, start_time_2: null, end_time_2: null }),
      day(1),
      day(2),
      day(3),
      day(4),
      day(5),
      day(6, { start_time: "09:00", end_time: "14:00", start_time_2: null, end_time_2: null }),
    ];

    const groups = groupWorkingHours(schedule);

    expect(groups.map((g) => g.days)).toEqual([[0], [1, 2, 3, 4, 5], [6]]);
    expect(formatDayRangeLabel(groups[0].days, dayNames)).toBe("Sunday");
    expect(formatDayRangeLabel(groups[1].days, dayNames)).toBe("Mon – Fri");
    expect(formatDayRangeLabel(groups[2].days, dayNames)).toBe("Saturday");
  });

  it("does not merge non-adjacent days that happen to share the same timing", () => {
    const schedule = [
      day(1, { start_time: "10:00", end_time: "12:00" }),
      day(2, { start_time: "08:00", end_time: "09:00" }),
      day(4, { start_time: "10:00", end_time: "12:00" }),
    ];

    const groups = groupWorkingHours(schedule);

    expect(groups.map((g) => g.days)).toEqual([[1], [2], [4]]);
  });

  it("groups consecutive closed days together", () => {
    const closed = (d: number) => day(d, { is_open: false, start_time: null, end_time: null, start_time_2: null, end_time_2: null });
    const schedule = [closed(0), closed(6), ...[1, 2, 3, 4, 5].map((d) => day(d))];

    const groups = groupWorkingHours(schedule);

    expect(groups.map((g) => g.days)).toEqual([[0], [1, 2, 3, 4, 5], [6]]);
  });

  it("re-splits a group once one day's schedule is edited to differ", () => {
    const schedule = [day(1), day(2), day(3, { end_time: "15:00" }), day(4), day(5)];

    const groups = groupWorkingHours(schedule);

    expect(groups.map((g) => g.days)).toEqual([[1, 2], [3], [4, 5]]);
  });

  it("returns an empty array for an empty schedule", () => {
    expect(groupWorkingHours([])).toEqual([]);
  });
});
