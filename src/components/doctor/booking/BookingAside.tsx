import { BadgeCheck, CalendarClock, CreditCard, IndianRupee, MapPin, RefreshCw, Timer, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { doctorName } from "@/lib/doctorSite/doctorFacts";

type Props = {
  profile: {
    full_name?: string | null;
    specialization?: string | null;
    clinic_name?: string | null;
    profile_photo_url?: string | null;
    address?: string | null;
    locality?: string | null;
    city?: string | null;
    slug?: string | null;
  } | null | undefined;
  service: { name: string; price: number; duration?: number | null } | null | undefined;
  type: "clinic" | "online";
  autoConfirm: boolean;
  payOnline: boolean;
  cutoffHours: number;
};

/**
 * "What to expect" beside the booking card. Every line comes from the clinic's own settings
 * (fee, length, address, confirmation, payment, cancellation window): nothing is promised
 * that the clinic did not set.
 */
const BookingAside = ({ profile, service, type, autoConfirm, payOnline, cutoffHours }: Props) => {
  const name = doctorName(profile);
  const address = [profile?.address, profile?.locality, profile?.city]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  const facts: { Icon: LucideIcon; title: string; detail?: string }[] = [];
  if (service) {
    facts.push({ Icon: IndianRupee, title: `₹${service.price} · ${service.name}`, detail: payOnline ? "Paid online when you book" : "Paid at the clinic" });
    if (service.duration) facts.push({ Icon: Timer, title: `${service.duration} minute visit` });
  }
  if (type === "online") facts.push({ Icon: Video, title: "Video consultation", detail: "Join from your phone; the link appears on your appointment page" });
  else if (address) facts.push({ Icon: MapPin, title: profile?.clinic_name?.trim() || "At the clinic", detail: address });
  facts.push(
    autoConfirm
      ? { Icon: BadgeCheck, title: "Confirmed instantly", detail: "You get a booking token and slip right away" }
      : { Icon: CalendarClock, title: "The clinic confirms your request", detail: "You get a booking token right away" },
  );
  if (payOnline) facts.push({ Icon: CreditCard, title: "Secure online payment", detail: "Your receipt can be downloaded any time" });
  facts.push({ Icon: RefreshCw, title: "Change of plans?", detail: `Reschedule or cancel online up to ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"} before` });

  return (
    <aside aria-label="About this appointment" className="ds-glass rounded-ds-lg p-5 sm:p-6">
      {name && (
        <div className="flex items-center gap-3 border-b border-ds-line pb-5">
          {profile?.profile_photo_url ? (
            <OptimizedImage src={profile.profile_photo_url} alt="" width={96} height={96} decoding="async" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-ds-surface" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-ds-display text-[1.25rem] font-medium leading-tight text-ds-ink">{name}</p>
            {profile?.specialization && <p className="truncate text-ds-small text-ds-ink-2">{profile.specialization}</p>}
          </div>
        </div>
      )}
      <ul className="mt-5 space-y-4">
        {facts.map(({ Icon, title, detail }) => (
          <li key={title} className="flex gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ds-accent-soft text-ds-accent-ink">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-ds-small font-semibold text-ds-ink">{title}</span>
              {detail && <span className="block text-ds-label text-ds-ink-2">{detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {profile?.slug && (
        <a
          href={`/dr/${profile.slug}/manage`}
          className="mt-6 flex min-h-12 items-center justify-between rounded-ds-md border border-ds-line px-4 text-ds-small font-medium text-ds-ink transition-colors hover:border-ds-ink/30 hover:bg-ds-ink/[0.03]"
        >
          Already booked? Open my appointment <span aria-hidden="true">→</span>
        </a>
      )}
    </aside>
  );
};

export default BookingAside;
