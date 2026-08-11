import { describe, it, expect } from "vitest";
import { groupByDoctor } from "./groupByDoctor";

type Item = { id: string; doctor_id: string; created_at: string; profiles: { full_name: string; clinic_name: string | null } | null };

describe("groupByDoctor", () => {
  it("groups items by doctor_id, sorting groups by most-recent item and items within a group newest-first", () => {
    const items: Item[] = [
      { id: "p1", doctor_id: "d1", created_at: "2026-08-01", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
      { id: "p2", doctor_id: "d1", created_at: "2026-08-05", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
      { id: "p3", doctor_id: "d2", created_at: "2026-08-10", profiles: { full_name: "Dr. B", clinic_name: "B Clinic" } },
    ];
    const groups = groupByDoctor(items);
    expect(groups.map((g) => g.doctorId)).toEqual(["d2", "d1"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["p2", "p1"]);
    expect(groups[0]).toMatchObject({ doctorName: "Dr. B", clinicName: "B Clinic" });
  });

  it("falls back to a placeholder name for a missing profiles join instead of dropping the item", () => {
    const items: Item[] = [{ id: "p1", doctor_id: "d1", created_at: "2026-08-01", profiles: null }];
    const groups = groupByDoctor(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ doctorName: "—", clinicName: null });
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByDoctor([])).toEqual([]);
  });
});
