export interface DoctorGroup<T> {
  doctorId: string;
  doctorName: string;
  clinicName: string | null;
  items: T[];
}

interface GroupableItem {
  doctor_id: string;
  created_at: string;
  profiles?: { full_name?: string | null; clinic_name?: string | null } | null;
}

export function groupByDoctor<T extends GroupableItem>(items: T[]): DoctorGroup<T>[] {
  const groups = new Map<string, DoctorGroup<T>>();

  for (const item of items) {
    const id = item.doctor_id;
    let group = groups.get(id);
    if (!group) {
      group = {
        doctorId: id,
        doctorName: item.profiles?.full_name || "—",
        clinicName: item.profiles?.clinic_name ?? null,
        items: [],
      };
      groups.set(id, group);
    }
    group.items.push(item);
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }
  result.sort((a, b) => (b.items[0]?.created_at || "").localeCompare(a.items[0]?.created_at || ""));

  return result;
}
