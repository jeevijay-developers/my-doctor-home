export interface HoursRow {
  day_of_week: number; is_open: boolean;
  start_time: string | null; end_time: string | null;
  start_time_2: string | null; end_time_2: string | null;
  practitioner_id?: string | null;
  [k: string]: unknown;
}

export function hoursFor<T extends HoursRow>(rows: T[], practitionerId: string): T[] {
  return rows.filter((r) => r.practitioner_id === practitionerId);
}

/** When the clinic is open: the union of its doctors' hours. A single doctor's rows come back unchanged. */
export function clinicHoursUnion<T extends HoursRow>(rows: T[]): T[] | HoursRow[] {
  if (new Set(rows.map((r) => r.practitioner_id ?? "")).size <= 1) return rows;
  const out: HoursRow[] = [];
  for (let d = 0; d < 7; d++) {
    const iv: [string, string][] = [];
    for (const r of rows) {
      if (r.day_of_week !== d || !r.is_open) continue;
      if (r.start_time && r.end_time) iv.push([r.start_time, r.end_time]);
      if (r.start_time_2 && r.end_time_2) iv.push([r.start_time_2, r.end_time_2]);
    }
    iv.sort((a, b) => a[0].localeCompare(b[0]));
    const merged: [string, string][] = [];
    for (const [s, e] of iv) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) { if (e > last[1]) last[1] = e; } else merged.push([s, e]);
    }
    const rest = merged.slice(1);
    out.push({
      day_of_week: d, is_open: merged.length > 0, practitioner_id: null,
      start_time: merged[0]?.[0] ?? null, end_time: merged[0]?.[1] ?? null,
      start_time_2: rest.length ? rest[0][0] : null, end_time_2: rest.length ? rest[rest.length - 1][1] : null,
    });
  }
  return out;
}
