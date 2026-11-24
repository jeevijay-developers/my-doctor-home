import { describe, expect, it } from "vitest";
import { choose, columnsFor, formatField, parseSlot } from "./timeColumns";

// A doctor who sees patients 9:00-12:00 and 17:00-20:00 in 30-minute slots, with 10:30 and 17:30 already booked.
const slots = ["09:00", "09:30", "10:00", "11:00", "11:30", "17:00", "18:00", "18:30", "19:00", "19:30"];

describe("parseSlot / formatField", () => {
  it("converts 24-hour times to the 12-hour clock correctly, including noon and midnight", () => {
    expect(parseSlot("00:05")).toMatchObject({ hour12: 12, period: "AM", minute: 5 });
    expect(parseSlot("12:00")).toMatchObject({ hour12: 12, period: "PM" });
    expect(parseSlot("13:45")).toMatchObject({ hour12: 1, period: "PM", minute: 45 });
    expect(formatField("09:00")).toBe("09:00 AM");
    expect(formatField("17:30")).toBe("05:30 PM");
    expect(formatField("12:00")).toBe("12:00 PM");
  });
});

describe("columnsFor", () => {
  it("offers only hours that have a free slot in the current half of the day", () => {
    expect(columnsFor(slots, "09:00").hours).toEqual([9, 10, 11]);
    expect(columnsFor(slots, "17:00").hours).toEqual([5, 6, 7]);
  });

  it("offers only the free minutes of the chosen hour (a booked 10:30 is simply not there)", () => {
    expect(columnsFor(slots, "09:00").minutes).toEqual([0, 30]);
    expect(columnsFor(slots, "10:00").minutes).toEqual([0]);
    expect(columnsFor(slots, "18:00").minutes).toEqual([0, 30]);
  });

  it("greys out a half of the day with nothing free", () => {
    expect(columnsFor(["09:00", "10:00"], "09:00").periods).toEqual({ AM: true, PM: false });
    expect(columnsFor(["15:00"], "15:00").periods).toEqual({ AM: false, PM: true });
  });

  it("falls back to the first slot when the current value is not in the list, and to empty columns with no slots", () => {
    expect(columnsFor(slots, "13:00").current?.time).toBe("09:00");
    expect(columnsFor([], "09:00")).toMatchObject({ hours: [], minutes: [], current: null });
  });

  it("orders 12 before 1 in the afternoon (clock order, not numeric)", () => {
    expect(columnsFor(["12:00", "13:00", "14:00"], "12:00").hours).toEqual([12, 1, 2]);
  });
});

describe("choose", () => {
  it("changing the hour keeps the minute when that combination is free", () => {
    expect(choose(slots, "09:30", { hour: 11 })).toBe("11:30");
  });

  it("changing the hour moves to the nearest free minute when the same minute is taken", () => {
    expect(choose(slots, "09:30", { hour: 10 })).toBe("10:00"); // 10:30 is booked, 10:00 is the only one
  });

  it("changing the minute selects exactly that slot", () => {
    expect(choose(slots, "09:00", { minute: 30 })).toBe("09:30");
  });

  it("switching to PM lands on a real afternoon slot, never an invented one", () => {
    expect(choose(slots, "09:00", { period: "PM" })).toBe("17:00");
    expect(choose(slots, "10:00", { period: "PM" })).toBe("17:00");
    expect(choose(slots, "11:30", { period: "PM" })).toBe("17:00");
  });

  it("switching back to AM keeps the hour and minute where they exist", () => {
    expect(choose(["09:00", "09:30", "17:00", "17:30"], "17:30", { period: "AM" })).toBe("09:00"); // no 5 AM, so first morning slot
    expect(choose(["05:00", "05:30", "17:00", "17:30"], "17:30", { period: "AM" })).toBe("05:30");
  });

  it("always returns a slot from the list", () => {
    for (const cur of slots) {
      for (const change of [{ hour: 9 }, { hour: 6 }, { minute: 30 }, { period: "AM" as const }, { period: "PM" as const }]) {
        expect(slots).toContain(choose(slots, cur, change));
      }
    }
  });

  it("returns the current value untouched when there are no slots at all", () => {
    expect(choose([], "09:00", { hour: 10 })).toBe("09:00");
  });
});
