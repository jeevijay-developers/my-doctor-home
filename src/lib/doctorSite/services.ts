// Display helpers for the doctor site's Services section.
import { Laptop, MapPin, Stethoscope } from "lucide-react";

export const serviceType = (type: string | null | undefined) => {
  if (type === "online") return { label: "Online", Icon: Laptop };
  if (type === "both") return { label: "Clinic & online", Icon: Stethoscope };
  return { label: "At the clinic", Icon: MapPin };
};

/** The service's own price, else the doctor's consultation fee; null when neither is set (never invented). */
export const displayPrice = (service: { price?: number | string | null }, consultationFee?: number | null) => {
  const own = Number(service.price);
  if (Number.isFinite(own) && own > 0) return own;
  const fee = Number(consultationFee);
  return Number.isFinite(fee) && fee > 0 ? fee : null;
};

