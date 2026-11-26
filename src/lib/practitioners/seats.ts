import type { Practitioner } from "./types";

// Client mirror of the DB's practitioner_seat_rank(): among active + bookable doctors,
// the main doctor first, then sort_order, created_at, id. A doctor whose rank is at or
// past the seat limit keeps existing bookings but cannot take new ones.
export function practitionersOverSeats(practitioners: Practitioner[], seatLimit: number | null | undefined): Set<string> {
  if (seatLimit == null) return new Set();
  const ordered = practitioners
    .filter((p) => p.is_active && p.is_bookable)
    .sort((a, b) =>
      Number(b.is_primary) - Number(a.is_primary)
      || a.sort_order - b.sort_order
      || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(ordered.slice(Math.max(seatLimit, 0)).map((p) => p.id));
}
