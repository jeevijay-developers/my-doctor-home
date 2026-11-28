import "./__test__/intersectionObserverVisibleStub";
// Phase 5: `?doctor=<slug>` deep link into booking, and each doctor's next free slot in the picker.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";
import { resetNextAvailableCache } from "@/hooks/useNextAvailableByDoctor";

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

const days = (pid: string, start: string, end: string) =>
  Array.from({ length: 7 }, (_, d) => ({
    day_of_week: d, is_open: true, start_time: start, end_time: end, start_time_2: null, end_time_2: null, practitioner_id: pid,
  }));

const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "General Physician", qualifications: "MBBS",
  experience_years: 10, bio: null, photo_url: null, registration_number: null, consultation_fee: null,
  slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0, ...over,
});
const DR_A = doc({});
const DR_B = doc({ id: "pb", display_name: "Dr. Vikram Shah", slug: "vikram-shah", specialization: "Cardiologist", is_primary: false, sort_order: 1 });
const DR_OFF = doc({ id: "pc", display_name: "Dr. Off", slug: "dr-off", bookable: false, online_booking: false, is_primary: false, sort_order: 2 });

const setDoctor = (over: Record<string, unknown> = {}) => {
  h.doctor = {
    profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha", clinic_name: "Sunrise Clinic" },
    services: [],
    settings: { booking_advance_days: 7, slot_duration_minutes: 30 },
    workingHours: days("", "09:00", "17:00"),
    allWorkingHours: [...days("pa", "09:00", "12:00"), ...days("pb", "15:00", "17:00")],
    practitioners: [DR_A, DR_B, DR_OFF],
    bookablePractitioners: [DR_A, DR_B],
    isMultiDoctor: true,
    isPremium: true,
    hasFeature: () => false,
    ...over,
  };
};

const at = (search: string) => window.history.replaceState({}, "", `/dr/asha${search}`);
const doctorGroup = () => screen.queryByRole("radiogroup", { name: "Doctor" });
const whenHeading = () => screen.queryByRole("heading", { name: "Select Time Slot" });

describe("BookingWidget ?doctor= deep link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNextAvailableCache();
    setDoctor();
    mock.current = createTableMock();
  });
  afterEach(() => at(""));

  it("preselects the doctor and opens When", async () => {
    at("?doctor=vikram-shah");
    render(<BookingWidget />);
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(screen.getAllByText("Dr. Vikram Shah").length).toBeGreaterThan(0);
  });

  it("matches the slug case-insensitively", async () => {
    at("?doctor=Vikram-Shah");
    render(<BookingWidget />);
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
  });

  it("ignores an unknown doctor silently and stays on the Doctor step", async () => {
    at("?doctor=nobody");
    render(<BookingWidget />);
    expect(await screen.findByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument();
    expect(whenHeading()).not.toBeInTheDocument();
  });

  it("ignores a doctor who cannot be booked online", async () => {
    at("?doctor=dr-off");
    render(<BookingWidget />);
    expect(await screen.findByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument();
    expect(whenHeading()).not.toBeInTheDocument();
  });

  it("ignores a malformed value", async () => {
    at("?doctor=%3Cscript%3E");
    render(<BookingWidget />);
    expect(await screen.findByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument();
  });

  it("is ignored by a single-doctor clinic, whose booking is unchanged", async () => {
    setDoctor({ isMultiDoctor: false, practitioners: [DR_A], bookablePractitioners: [DR_A], allWorkingHours: days("pa", "09:00", "12:00") });
    at("?doctor=asha-rao");
    render(<BookingWidget />);
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(doctorGroup()).not.toBeInTheDocument();
  });

  it("waits for a doctor list that loads late, and acts once", async () => {
    setDoctor({ bookablePractitioners: [] });
    at("?doctor=vikram-shah");
    const { rerender } = render(<BookingWidget />);
    expect(whenHeading()).not.toBeInTheDocument();
    setDoctor();
    rerender(<BookingWidget />);
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
  });

  it("does not leave the URL parameter behind in anything it writes", async () => {
    at("?doctor=vikram-shah");
    render(<BookingWidget />);
    await screen.findByRole("heading", { name: "Select Time Slot" });
    expect(window.location.search).toBe("?doctor=vikram-shah"); // read only: never rewritten or added to links
  });
});

describe("BookingWidget doctor picker: next available", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNextAvailableCache();
    setDoctor();
    at("");
    mock.current = createTableMock();
  });

  const future = () => {
    const d = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10); // 1-2 days ahead (IST or not)
    return d;
  };

  it("shows each doctor's chip from one call, and nothing for a doctor with no slot", async () => {
    mock.current.rpcs.get_public_next_available = () => [
      { practitioner_id: "pa", next_date: future(), next_time: "10:00:00" },
      { practitioner_id: "pb", next_date: null, next_time: null },
    ];
    render(<BookingWidget />);
    const group = await screen.findByRole("radiogroup", { name: "Doctor" });
    await waitFor(() => expect(within(group).getAllByText(/^Next:/)).toHaveLength(1));
    const radios = within(group).getAllByRole("radio");
    expect(radios[0]).toHaveTextContent(/Next: .*10:00 am/);
    expect(radios[1]).not.toHaveTextContent("Next:");
    const calls = mock.current.client.rpc.mock.calls.filter((c: unknown[]) => c[0] === "get_public_next_available");
    expect(calls).toHaveLength(1);
  });

  it("shows no chips and still lets the patient book when the call fails", async () => {
    mock.current.rpcs.get_public_next_available = () => ({ data: null, error: { message: "down" } });
    render(<BookingWidget />);
    const group = await screen.findByRole("radiogroup", { name: "Doctor" });
    await act(async () => {});
    expect(within(group).queryByText(/^Next:/)).not.toBeInTheDocument();
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
  });

  it("does not ask at all for a single-doctor clinic", async () => {
    setDoctor({ isMultiDoctor: false, practitioners: [DR_A], bookablePractitioners: [DR_A], allWorkingHours: days("pa", "09:00", "12:00") });
    render(<BookingWidget />);
    await act(async () => {});
    expect(mock.current.client.rpc.mock.calls.some((c: unknown[]) => c[0] === "get_public_next_available")).toBe(false);
  });
});
