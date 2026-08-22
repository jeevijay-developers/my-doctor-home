export interface WorkingHourLike {
  day_of_week: number;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
  start_time_2: string | null;
  end_time_2: string | null;
}

export interface WorkingHourGroup<T extends WorkingHourLike> {
  days: number[];
  sample: T;
}

const scheduleKey = (item: WorkingHourLike): string =>
  item.is_open ? [item.start_time, item.end_time, item.start_time_2, item.end_time_2].join("|") : "closed";

/**
 * Groups consecutive days (by day_of_week, ascending) that share the exact
 * same schedule into a single entry. A gap in day_of_week (a day missing
 * from the input) breaks the run, same as a differing schedule would.
 */
export function groupWorkingHours<T extends WorkingHourLike>(schedule: T[]): WorkingHourGroup<T>[] {
  const sorted = [...schedule].sort((a, b) => a.day_of_week - b.day_of_week);
  const groups: WorkingHourGroup<T>[] = [];

  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const isConsecutive = last && last.days[last.days.length - 1] === item.day_of_week - 1;
    if (last && isConsecutive && scheduleKey(last.sample) === scheduleKey(item)) {
      last.days.push(item.day_of_week);
    } else {
      groups.push({ days: [item.day_of_week], sample: item });
    }
  }

  return groups;
}

export function formatDayRangeLabel(days: number[], dayNames: string[]): string {
  if (days.length <= 1) return dayNames[days[0]] || "Day";
  const short = (d: number) => (dayNames[d] || "Day").slice(0, 3);
  return `${short(days[0])} – ${short(days[days.length - 1])}`;
}
