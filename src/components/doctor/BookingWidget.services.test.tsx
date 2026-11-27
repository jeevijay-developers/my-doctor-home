import "./__test__/intersectionObserverVisibleStub";
// Services limited to some doctors: the booking widget only offers a service the chosen doctor offers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({ doctor: {} as any }));

vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: () => h.doctor }));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
vi.mock("@/hooks/useSlotAvailability", () => ({
  useSlotAvailability: () => ({ counts: {}, isFull: () => false, bookedIn: () => 0, refresh: vi.fn(async () => ({})) }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
vi.mock("./motion/scroll", () => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./AppointmentSlip", () => ({ default: () => null }));
vi.mock("./PaymentSlip", () => ({ default: () => null }));
vi.mock("./MockCheckoutModal", () => ({ default: () => null }));
vi.mock("@/lib/downloadPdfFromNode", () => ({ downloadPdfFromNode: vi.fn() }));
vi.mock("@/lib/razorpayCheckout", () => ({ loadRazorpayCheckout: vi.fn(async () => undefined) }));

const days = (pid: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    day_of_week: d, is_open: true, start_time: "09:00:00", end_time: "17:00:00", start_time_2: null, end_time_2: null, practitioner_id: pid,
  }));
const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "GP", qualifications: "MBBS",
  experience_years: 10, bio: null, photo_url: null, registration_number: null, consultation_fee: null,
  slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0, ...over,
});
const DR_A = doc({});
const DR_B = doc({ id: "pb", display_name: "Dr. Vikram Shah", slug: "vikram-shah", is_primary: false, sort_order: 1 });
const svc = (id: string, name: string) => ({ id, name, price: 300, type: "clinic", duration: 20, active: true });

const setDoctor = (over: Record<string, unknown> = {}) => {
  h.doctor = {
    profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha", clinic_name: "Sunrise Clinic" },
    services: [svc("s1", "Heart Check"), svc("s2", "Skin Check")],
    settings: { booking_advance_days: 7, slot_duration_minutes: 30 },
    workingHours: days(""),
    allWorkingHours: [...days("pa"), ...days("pb")],
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_A, DR_B],
    soleBookable: null,
    // s1 only by Vikram (pb); s2 unmapped.
    servicePractitioners: [{ service_id: "s1", practitioner_id: "pb" }],
    isMultiDoctor: true,
    isPremium: true,
    hasFeature: () => false,
    ...over,
  };
};

const pickDoctor = async (name: RegExp) => {
  await screen.findByRole("radiogroup", { name: "Doctor" });
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Doctor" })).getByRole("radio", { name }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Select Time Slot" });
};
const serviceNames = () => {
  fireEvent.click(screen.getByRole("button", { name: /Change service/ }));
  const names = within(screen.getByRole("radiogroup", { name: "Service" })).getAllByRole("radio").map((r) => r.textContent ?? "");
  fireEvent.click(screen.getByRole("button", { name: /Done service/ }));
  return names;
};
const has = (names: string[], text: string) => names.some((n) => n.includes(text));
const dispatchService = (detail: unknown) => act(() => { window.dispatchEvent(new CustomEvent("doctylia:select-service", { detail })); });

describe("BookingWidget services per doctor", () => {
  beforeEach(() => {
    setDoctor();
    mock.current = createTableMock();
  });

  it("hides a service mapped only to other doctors, keeps unmapped ones and the default option", async () => {
    render(<BookingWidget />);
    await pickDoctor(/Asha Rao/);
    const names = serviceNames();
    expect(has(names, "Clinic Visit")).toBe(true);
    expect(has(names, "Skin Check")).toBe(true);
    expect(has(names, "Heart Check")).toBe(false);
  });

  it("offers the mapped service to the doctor it is mapped to", async () => {
    render(<BookingWidget />);
    await pickDoctor(/Vikram Shah/);
    const names = serviceNames();
    expect(has(names, "Heart Check")).toBe(true);
    expect(has(names, "Skin Check")).toBe(true);
  });

  it("choosing another doctor clears a service that doctor does not offer", async () => {
    render(<BookingWidget />);
    await pickDoctor(/Vikram Shah/);
    dispatchService(svc("s1", "Heart Check"));
    expect(screen.getByText(/Heart Check · ₹300/)).toBeInTheDocument();
    dispatchSelectDoctor("pa");
    expect(await screen.findByText(/Clinic Visit · ₹750/)).toBeInTheDocument();
    expect(screen.queryByText(/Heart Check/)).not.toBeInTheDocument();
    // Going back to the doctor who offers it does not resurrect the old selection.
    dispatchSelectDoctor("pb");
    expect(await screen.findByText(/Clinic Visit · ₹750/)).toBeInTheDocument();
  });

  it("the select-service event is not applied for a service the chosen doctor does not offer, and a hint says why", async () => {
    render(<BookingWidget />);
    await pickDoctor(/Asha Rao/);
    dispatchService(svc("s1", "Heart Check"));
    expect(screen.getByText(/Clinic Visit · ₹750/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Heart Check isn't offered by Dr. Asha Rao. Choose another doctor to book it.");
  });

  it("the hint goes away when the doctor changes", async () => {
    render(<BookingWidget />);
    await pickDoctor(/Asha Rao/);
    dispatchService(svc("s1", "Heart Check"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    dispatchSelectDoctor("pb");
    await screen.findByRole("heading", { name: "Select Time Slot" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hides a service whose mapped doctors are all outside the bookable doctors", async () => {
    setDoctor({ servicePractitioners: [{ service_id: "s1", practitioner_id: "gone" }] });
    render(<BookingWidget />);
    await pickDoctor(/Vikram Shah/);
    expect(has(serviceNames(), "Heart Check")).toBe(false);
  });

  it("a single-doctor clinic ignores mappings entirely", () => {
    setDoctor({ isMultiDoctor: false, practitioners: [DR_A], bookablePractitioners: [DR_A], allWorkingHours: days("pa"), workingHours: days("pa") });
    render(<BookingWidget />);
    const names = serviceNames();
    expect(has(names, "Heart Check")).toBe(true);
    expect(has(names, "Skin Check")).toBe(true);
  });

  it("a clinic with one bookable doctor of several filters for that doctor", () => {
    setDoctor({ isMultiDoctor: false, soleBookable: DR_A, practitioners: [DR_A, DR_B], bookablePractitioners: [DR_A], allWorkingHours: days("pa"), workingHours: days("pa") });
    render(<BookingWidget />);
    const names = serviceNames();
    expect(has(names, "Heart Check")).toBe(false);
    expect(has(names, "Skin Check")).toBe(true);
  });
});

function dispatchSelectDoctor(id: string) {
  act(() => { window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id } })); });
}
