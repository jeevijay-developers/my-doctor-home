import { describe, expect, it } from "vitest";
import { emptyMedicineItem, parseMedicineItems } from "./prescriptionMedicines";

describe("emptyMedicineItem", () => {
  it("returns a blank after-food item and a fresh object each time", () => {
    const a = emptyMedicineItem();
    expect(a).toEqual({ name: "", strength: "", morning: 0, afternoon: 0, evening: 0, durationDays: 0, food: "after" });
    a.name = "x";
    expect(emptyMedicineItem().name).toBe("");
  });
});

describe("parseMedicineItems", () => {
  it("returns [] for non-arrays", () => {
    for (const v of [null, undefined, "x", 5, {}, { name: "a" }]) expect(parseMedicineItems(v)).toEqual([]);
  });
  it("parses a well-formed row", () => {
    expect(
      parseMedicineItems([{ name: "Paracetamol", strength: "500mg", morning: 1, afternoon: 0, evening: 1, durationDays: 5, food: "before" }]),
    ).toEqual([{ name: "Paracetamol", strength: "500mg", morning: 1, afternoon: 0, evening: 1, durationDays: 5, food: "before" }]);
  });
  it("drops rows without a (non-blank) name, and non-object entries", () => {
    const out = parseMedicineItems([null, 3, "x", [], { name: "" }, { name: "   " }, { strength: "1mg" }, { name: "Ok" }]);
    // arrays are objects: [] has no name so is dropped too
    expect(out.map((m) => m.name)).toEqual(["Ok"]);
  });
  it("coerces malformed fields to safe defaults", () => {
    const [m] = parseMedicineItems([
      { name: "X", strength: 5, morning: true, afternoon: "1", evening: 2, durationDays: "7", food: "with" },
    ]);
    expect(m).toEqual({ name: "X", strength: "", morning: 0, afternoon: 0, evening: 0, durationDays: 0, food: "after" });
  });
  it("durationDays must be a positive number", () => {
    const days = (d: unknown) => parseMedicineItems([{ name: "X", durationDays: d }])[0].durationDays;
    expect(days(1)).toBe(1);
    expect(days(0)).toBe(0);
    expect(days(-3)).toBe(0);
    expect(days(NaN)).toBe(0);
    expect(days(null)).toBe(0);
  });
  it("preserves order", () => {
    expect(parseMedicineItems([{ name: "B" }, { name: "A" }]).map((m) => m.name)).toEqual(["B", "A"]);
  });
  it("keeps a name with surrounding whitespace verbatim", () => {
    expect(parseMedicineItems([{ name: " Dolo " }])[0].name).toBe(" Dolo ");
  });
});
