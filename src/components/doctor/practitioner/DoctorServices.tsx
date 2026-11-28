import { useDoctorData } from "@/contexts/DoctorContext";
import { FEATURE_KEYS } from "@/lib/features";
import { displayPrice, serviceType } from "@/lib/doctorSite/services";
import { servicesForDoctor } from "@/lib/doctorSite/practitionerPage";
import { practitionerFee } from "@/lib/practitioners/fee";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import DsButton from "../ui/DsButton";
import { bookNow } from "../siteActions";
import { SELECT_DOCTOR_EVENT } from "../DoctorsSection";

type Service = { id: string; name?: string | null; description?: string | null; type?: string | null; duration?: number | null; price?: number | string | null };

/**
 * "Services offered by Dr X": a service nobody is mapped to is offered by every doctor, a mapped one
 * only by the doctors named (the same rule the booking checks). Hidden when the list ends up empty.
 */
const DoctorServices = ({ doctor, name }: { doctor: PublicPractitioner; name: string }) => {
  const { services, servicePractitioners, hasFeature, profile } = useDoctorData();
  const onlineAllowed = hasFeature?.(FEATURE_KEYS.ONLINE_CONSULTATION) === true;
  const list = servicesForDoctor((services ?? []) as Service[], servicePractitioners, doctor.id, onlineAllowed);
  const fee = practitionerFee(doctor, profile?.consultation_fee);
  if (list.length === 0) return null;

  const book = (service: Service) => {
    window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctor.id } }));
    window.dispatchEvent(new CustomEvent("doctylia:select-service", { detail: service }));
    bookNow();
  };

  return (
    <section id="services" aria-labelledby="doctor-services">
      <h2 id="doctor-services" className="font-ds-display text-ds-h3 font-medium">Services offered by {name}</h2>
      <ul className="mt-4 border-t border-ds-line">
        {list.map((service) => {
          const type = serviceType(service.type);
          const price = displayPrice(service, fee);
          const label = service.name?.trim() || "Consultation";
          return (
            <li key={service.id} className="flex flex-col gap-3 border-b border-ds-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <h3 className="break-words text-[1.0625rem] font-semibold text-ds-ink sm:text-ds-body">{label}</h3>
                {service.description?.trim() && (
                  <p className="mt-1 break-words text-[1.0625rem] text-ds-ink-2 sm:text-ds-body">{service.description.trim()}</p>
                )}
                <p className="mt-1 text-ds-small text-ds-ink-3">
                  {[type.label, service.duration ? `${service.duration} min` : "", price != null ? `₹${price}` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
              {doctor.bookable && (
                <DsButton variant="secondary" onClick={() => book(service)} aria-label={`Book ${label} with ${name}`} className="shrink-0 self-start sm:self-center">
                  Book
                </DsButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default DoctorServices;
