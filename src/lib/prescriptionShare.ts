import { normalizeIndianPhone, isValidIndianPhone } from "@/lib/phone";

/** Digits-only international number for wa.me (no "+"), or null if it can't be one. */
export const whatsappNumber = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  if (isValidIndianPhone(raw)) return `91${normalizeIndianPhone(raw)}`;
  // Already international (e.g. +44...): keep digits if the length is plausible.
  const digits = raw.replace(/\D/g, "");
  return raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15 ? digits : null;
};

export const prescriptionShareUrl = (origin: string, token: string) => `${origin}/rx/${token}`;

export const buildShareMessage = (opts: { patientName: string; doctorName: string; link: string }) =>
  `Hello ${opts.patientName}, here is your prescription from Dr. ${opts.doctorName}.\n` +
  `Open it with the last 4 digits of your phone number:\n${opts.link}`;

/** Chat link prefilled with the message. With no valid number it opens WhatsApp's own chooser. */
export const buildWhatsAppUrl = (phone: string | null | undefined, message: string) => {
  const to = whatsappNumber(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(message)}`;
};
