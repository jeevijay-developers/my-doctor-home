export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/**
 * Reduces a clinic's location into "District, State" for patient-facing
 * display. Prefers the doctor's explicitly saved `state`; if it's not set
 * (e.g. saved before the state field existed), falls back to matching the
 * free-text address against the known list of Indian states/UTs. District
 * falls back to the clinic's city.
 */
export const formatClinicLocation = (
  address?: string | null,
  city?: string | null,
  state?: string | null
): string | null => {
  const district = city?.trim() || null;

  let resolvedState: string | null = state?.trim() || null;
  if (!resolvedState && address) {
    const lower = address.toLowerCase();
    resolvedState = INDIAN_STATES.find((s) => lower.includes(s.toLowerCase())) || null;
  }

  if (district && resolvedState) return `${district}, ${resolvedState}`;
  if (district) return district;
  if (resolvedState) return resolvedState;
  return null;
};
