import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  doctor: {} as any,
  features: { online_consultation: false } as Record<string, boolean>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(async () => ({})),
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: () => h.doctor }));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
vi.mock("@/hooks/useSlotAvailability", () => ({
  useSlotAvailability: () => ({ counts: {}, isFull: () => false, bookedIn: () => 0, refresh: h.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("./AppointmentSlip", () => ({ default: () => null }));
vi.mock("./PaymentSlip", () => ({ default: () => null }));
vi.mock("./MockCheckoutModal", () => ({ default: () => null }));
vi.mock("@/lib/downloadPdfFromNode", () => ({ downloadPdfFromNode: vi.fn() }));

const allDaysOpen = Array.from({ length: 7 }, (_, d) => ({
  day_of_week: d, is_open: true, start_time: "09:00", end_time: "12:00", start_time_2: null, end_time_2: null,
}));

const setDoctor = (over: Record<string, unknown> = {}) => {
  h.doctor = {
    profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha" },
    services: [],
    settings: { booking_advance_days: 7, slot_duration_minutes: 30 },
    workingHours: allDaysOpen,
    isPremium: false,
    hasFeature: (k: string) => h.features[k] === true,
    ...over,
  };
};

const dayButtons = () =>
  screen.getAllByRole("button").filter((b) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(b.textContent || ""));

const gotoDetails = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Clinic Visit/ }));
  await screen.findByRole("heading", { name: "Select Date" });
  fireEvent.click(dayButtons()[1]); // tomorrow: never has past slots
  await screen.findByRole("heading", { name: "Select Time Slot" });
  fireEvent.click(await screen.findByRole("button", { name: "09:00" }));
  await screen.findByLabelText("Full name");
};

const fillDetails = (over: Record<string, string> = {}) => {
  const v = { name: "Ravi Kumar", phone: "9876500001", age: "40", email: "", ...over };
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: v.name } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: v.phone } });
  fireEvent.change(screen.getByLabelText("Age"), { target: { value: v.age } });
  fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: v.email } });
  fireEvent.change(document.querySelector("select")!, { target: { value: "male" } });
};

const book = () => fireEvent.click(screen.getByRole("button", { name: /Book Appointment - ₹/ }));
const inserts = () =>
  mock.current.opsOf("appointments").filter((q: any) => q.ops.some((o: any[]) => o[0] === "insert"));

describe("BookingWidget (pay at clinic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.features = { online_consultation: false };
    setDoctor();
    mock.current = createTableMock();
    mock.current.tables.appointments = { data: { id: "appt-1" }, error: null };
  });

  it("offers Clinic Visit only when online consultation is not on the plan", () => {
    render(<BookingWidget />);
    expect(screen.getByRole("button", { name: /Clinic Visit/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Online/ })).not.toBeInTheDocument();
  });

  it("offers Online when the doctor has the online_consultation feature", () => {
    h.features = { online_consultation: true };
    render(<BookingWidget />);
    expect(screen.getByRole("button", { name: /Online/ })).toBeInTheDocument();
  });

  it("uses the profile fee for the default consultation and a custom service's own price", () => {
    setDoctor({ services: [{ id: "s1", name: "ECG", price: 300, duration: 20, type: "clinic", active: true }] });
    render(<BookingWidget />);
    expect(screen.getByText("₹750")).toBeInTheDocument();
    expect(screen.getByText("ECG")).toBeInTheDocument();
    expect(screen.getByText("₹300")).toBeInTheDocument();
  });

  it("hides inactive services and services of another consultation type", () => {
    setDoctor({
      services: [
        { id: "s1", name: "Hidden", price: 100, type: "clinic", active: false },
        { id: "s2", name: "OnlineOnly", price: 100, type: "online", active: true },
        { id: "s3", name: "BothOk", price: 120, type: "both", active: true },
      ],
    });
    render(<BookingWidget />);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("OnlineOnly")).not.toBeInTheDocument();
    expect(screen.getByText("BothOk")).toBeInTheDocument();
  });

  it("falls back to the default fee for a service with no price, never showing ₹0 for a priced default", () => {
    setDoctor({ services: [{ id: "s1", name: "Unpriced", price: null, type: "clinic", active: true }] });
    render(<BookingWidget />);
    expect(screen.getAllByText("₹750").length).toBe(2);
  });

  it("shows a free (₹0) consultation as ₹0, not ₹500", () => {
    setDoctor({
      profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 0, slug: "asha" },
      services: [{ id: "s1", name: "ECG", price: 300, duration: 20, type: "clinic", active: true }],
    });
    render(<BookingWidget />);
    expect(screen.queryByText("₹500")).not.toBeInTheDocument();
  });

  it("closed days cannot be picked", async () => {
    setDoctor({ workingHours: allDaysOpen.map((w) => ({ ...w, is_open: false })) });
    render(<BookingWidget />);
    fireEvent.click(screen.getByRole("button", { name: /Clinic Visit/ }));
    await screen.findByRole("heading", { name: "Select Date" });
    for (const b of dayButtons()) expect(b).toBeDisabled();
  });

  it("slots are generated from working hours at the doctor's slot duration", async () => {
    render(<BookingWidget />);
    fireEvent.click(screen.getByRole("button", { name: /Clinic Visit/ }));
    await screen.findByRole("heading", { name: "Select Date" });
    fireEvent.click(dayButtons()[1]);
    await screen.findByRole("heading", { name: "Select Time Slot" });
    for (const t of ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]) {
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "12:00" })).not.toBeInTheDocument();
  });

  it("validates a bad phone number before inserting", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails({ phone: "12345" });
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(inserts()).toHaveLength(0);
  });

  it("rejects an impossible age", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails({ age: "150" });
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Please enter a valid age (0–120)."));
    expect(inserts()).toHaveLength(0);
  });

  it("rejects a malformed optional email", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails({ email: "not-an-email" });
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Enter a valid email or leave it blank."));
    expect(inserts()).toHaveLength(0);
  });

  it("books a pending, pay-at-clinic appointment for this doctor with the service price", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    await waitFor(() => expect(inserts()).toHaveLength(1));
    const row = inserts()[0].ops.find((o: any[]) => o[0] === "insert")[1];
    expect(row).toMatchObject({
      doctor_id: "doc-1",
      patient_name: "Ravi Kumar",
      appointment_type: "clinic",
      time_slot: "09:00",
      amount: 750,
      status: "pending",
      payment_status: "pay_at_clinic",
    });
    expect(String(row.patient_phone)).toContain("9876500001");
    expect(row.token_number).toMatch(/^[A-Z0-9]{7,8}$/);
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a taken slot sends the patient back to time selection with an explanation", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "SLOT_FULL: taken" } };
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/just booked by someone else/)));
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(h.refresh).toHaveBeenCalled();
  });

  it("explains the 3-booking limit", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "TOO_MANY_BOOKINGS" } };
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/3 upcoming bookings/)));
  });

  it("an unknown database error shows a generic failure, not a confirmation", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "boom" } };
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Booking failed. Please try again."));
    expect(screen.queryByRole("button", { name: "Book Another" })).not.toBeInTheDocument();
  });

  it("success shows the confirmation screen", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    expect(await screen.findByRole("button", { name: "Book Another" })).toBeInTheDocument();
  });
});
