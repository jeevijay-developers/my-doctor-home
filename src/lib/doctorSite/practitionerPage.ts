// Pure rules for one doctor's own page (/dr/:slug/doctor/:doctorSlug) of a team clinic.

import type { PublicPractitioner } from "../practitioners/types";
import { isPractitionerIndexable } from "../seo/clinicTeam";

type ServiceLike = { id: string; type?: string | null };
type MappingLike = { service_id: string; practitioner_id: string };

/**
 * The services one doctor offers. A service with no mapping rows is offered by every doctor; with
 * rows, only by the doctors named. Mirrors the server rule (public_booking_price / SERVICE_NOT_OFFERED)
 * and ServicesSection. `onlineAllowed` hides online-only services the plan cannot sell.
 */
export function servicesForDoctor<T extends ServiceLike>(
  services: T[] | null | undefined,
  mappings: MappingLike[] | null | undefined,
  doctorId: string,
  onlineAllowed: boolean,
): T[] {
  const rows = mappings ?? [];
  return (services ?? [])
    .filter((s) => s.type !== "online" || onlineAllowed)
    .filter((s) => {
      const own = rows.filter((m) => m.service_id === s.id);
      return own.length === 0 || own.some((m) => m.practitioner_id === doctorId);
    });
}

/** The clinic's other doctors that have a page (a slug), in the clinic's order. */
export const otherDoctors = (practitioners: PublicPractitioner[] | null | undefined, currentId: string): PublicPractitioner[] =>
  (practitioners ?? []).filter((d) => d.id !== currentId && !!d.slug);

/** Same rule as the edge: an unlisted doctor or one without a real bio is served `noindex`. */
export const doctorPageNoindex = (doctor: Pick<PublicPractitioner, "slug" | "bio" | "directory_listed">): boolean =>
  !isPractitionerIndexable(doctor);

/** A bio longer than this starts collapsed behind "Read more" so the page stays scannable. */
export const LONG_BIO_CHARS = 900;

/** A bio as paragraphs (blank-line separated); line breaks inside a paragraph are kept by the renderer. */
export const bioParagraphs = (bio: string | null | undefined): string[] =>
  (bio ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
