import "./__test__/intersectionObserverVisibleStub";
import { continueWithTime, pickTomorrow, timeField } from "./__test__/bookingFlow";
// Multi-doctor clinics: the patient chooses a doctor first, and everything after
// (hours, slot length, fee, the booking itself) follows that doctor.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { dsScrollTo } from "./motion/scroll";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  doctor: {} as any,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  refresh: vi.fn(async () => ({})),
  slotArgs: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: () => h.doctor }));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
vi.mock("@/hooks/useSlotAvailability", () => ({
  useSlotAvailability: (...args: unknown[]) => {
    h.slotArgs.push(args);
    return { counts: {}, isFull: () => false, bookedIn: () => 0, refresh: h.refresh };
  },
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess, info: h.toastInfo } }));
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
const DR_B = doc({
  id: "pb", display_name: "Dr. Vikram Shah", slug: "vikram-shah", specialization: "Cardiologist", consultation_fee: 1200,
  slot_duration_minutes: 60, is_primary: false, sort_order: 1,
});

// Dr A: 09-12, clinic slot length (30). Dr B: 15-17 only, his own 60-minute slots.
const ALL_HOURS = [...days("pa", "09:00", "12:00"), ...days("pb", "15:00", "17:00")];

const setDoctor = (over: Record<string, unknown> = {}) => {
  h.doctor = {
    profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha", clinic_name: "Sunrise Clinic" },
    services: [],
    settings: { booking_advance_days: 7, slot_duration_minutes: 30 },
    workingHours: days("", "09:00", "17:00"),
    allWorkingHours: ALL_HOURS,
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_A, DR_B],
    isMultiDoctor: true,
    isPremium: true,
    hasFeature: () => false,
    ...over,
  };
};

const doctorRadio = (name: RegExp) => within(screen.getByRole("radiogroup", { name: "Doctor" })).getByRole("radio", { name });
const chooseDoctor = async (name: RegExp) => {
  await screen.findByRole("radiogroup", { name: "Doctor" }); // the step change animates
  fireEvent.click(doctorRadio(name));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Select Time Slot" });
};

const fillDetails = () => {
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: "Ravi Kumar" } });
  fireEvent.change(screen.getByLabelText(/^Mobile number/), { target: { value: "9876500001" } });
  fireEvent.change(screen.getByLabelText(/^Age/), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText(/^Gender/), { target: { value: "male" } });
  fireEvent.change(screen.getByLabelText(/^Reason for visit/), { target: { value: "Chest pain" } });
};

const gotoDetails = async (expectedTime: string) => {
  await pickTomorrow();
  await waitFor(() => expect(timeField()).toHaveTextContent(expectedTime));
  continueWithTime();
  await screen.findByLabelText(/^Full name/);
};

const inserts = () => mock.current.opsOf("appointments").filter((q: any) => q.ops.some((o: any[]) => o[0] === "insert"));
const insertedRow = () => inserts()[0].ops.find((o: any[]) => o[0] === "insert")[1];

describe("BookingWidget (multi-doctor clinic, pay at clinic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.slotArgs = [];
    setDoctor();
    mock.current = createTableMock();
    mock.current.tables.appointments = { data: { id: "appt-1" }, error: null };
  });

  it("starts on a Doctor step with one card per bookable doctor; Continue waits for a choice", () => {
    render(<BookingWidget />);
    expect(screen.getByText("Doctor", { selector: "span" })).toBeInTheDocument(); // the stepper label
    const radios = within(screen.getByRole("radiogroup", { name: "Doctor" })).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveTextContent("Dr. Asha Rao");
    expect(radios[1]).toHaveTextContent("Dr. Vikram Shah");
    expect(radios[1]).toHaveTextContent("₹1200");
    expect(radios[0]).toHaveTextContent("₹750"); // no own fee: the clinic's
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Select Time Slot" })).not.toBeInTheDocument();
    fireEvent.click(doctorRadio(/Vikram Shah/));
    expect(doctorRadio(/Vikram Shah/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("offers the chosen doctor's own hours at their own slot length, and polls that doctor's slots", async () => {
    render(<BookingWidget />);
    await chooseDoctor(/Vikram Shah/);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("03:00 PM"));
    fireEvent.click(timeField());
    const options = (name: string) => within(screen.getByRole("radiogroup", { name })).getAllByRole("radio").map((r) => r.textContent);
    expect(options("Hour")).toEqual(["03", "04"]);
    expect(options("Minute")).toEqual(["00"]);
    expect(h.slotArgs.some((a) => a[0] === "doc-1" && typeof a[1] === "string" && a[3] === "pb")).toBe(true);
  });

  it("books with the chosen doctor and that doctor's fee", async () => {
    render(<BookingWidget />);
    await chooseDoctor(/Vikram Shah/);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking · ₹1200/ }));
    await waitFor(() => expect(inserts()).toHaveLength(1));
    expect(insertedRow()).toMatchObject({ doctor_id: "doc-1", practitioner_id: "pb", time_slot: "15:00", amount: 1200 });
    expect(await screen.findByText("Dr. Vikram Shah")).toBeInTheDocument(); // confirmation names the doctor
  });

  it("a 'Book' tap from the doctors section preselects that doctor and opens When", async () => {
    render(<BookingWidget />);
    act(() => {
      window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "pb" } }));
    });
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    await waitFor(() => expect(timeField()).toHaveTextContent(/PM$/));
    expect(screen.getAllByText("Dr. Vikram Shah").length).toBeGreaterThan(0);
  });

  it("a silent select-doctor (a doctor's own page on load) preselects without scrolling to the booking card", async () => {
    render(<BookingWidget />);
    vi.mocked(dsScrollTo).mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "pb", silent: true } }));
    });
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(dsScrollTo).not.toHaveBeenCalled();
  });

  it("a tap on Book (not silent) still scrolls to the booking card", async () => {
    render(<BookingWidget />);
    vi.mocked(dsScrollTo).mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "pb" } }));
    });
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(dsScrollTo).toHaveBeenCalledWith("booking-card");
  });

  it("ignores a select-doctor event for a doctor who cannot be booked", () => {
    render(<BookingWidget />);
    act(() => {
      window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "nope" } }));
    });
    expect(screen.getByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument();
  });

  it("changing doctor clears the chosen date and time and follows the new doctor's hours", async () => {
    // pickTomorrow() after each choice keeps this deterministic: without it, whether "today"
    // still has one of Dr B's two slots left (and so which slot is first) depends on the real
    // wall-clock time the test happens to run at.
    render(<BookingWidget />);
    await chooseDoctor(/Asha Rao/);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    fireEvent.click(screen.getByRole("button", { name: "Change doctor" }));
    await chooseDoctor(/Vikram Shah/);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("03:00 PM"));
  });

  it("PRACTITIONER_NOT_BOOKABLE from the database shows the doctor message, not a generic failure", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "PRACTITIONER_NOT_BOOKABLE" } };
    render(<BookingWidget />);
    await chooseDoctor(/Vikram Shah/);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("This doctor is not taking bookings right now."));
    expect(h.toastError).not.toHaveBeenCalledWith("Booking failed. Please try again.");
    expect(await screen.findByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument(); // back to choose another
  });

  it("SERVICE_NOT_OFFERED from the database shows the service message", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "P0001: SERVICE_NOT_OFFERED" } };
    render(<BookingWidget />);
    await chooseDoctor(/Vikram Shah/);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("This doctor doesn't offer that service. Please choose another service or doctor."));
    expect(h.toastError).not.toHaveBeenCalledWith("Booking failed. Please try again.");
  });
});

describe("BookingWidget (multi-doctor clinic, online payment)", () => {
  const ORDER = { payment_id: "pay-1", order_id: "order_1", key_id: "rzp_test_x", amount: 120000, currency: "INR", mode: "live" };
  const rz = { instances: [] as any[], opened: 0 };
  const orderCalls = () => mock.current.invoke.mock.calls.filter((c: any[]) => c[0] === "create-razorpay-order");

  beforeEach(() => {
    vi.clearAllMocks();
    h.slotArgs = [];
    rz.instances = []; rz.opened = 0;
    (window as any).Razorpay = function (this: any, opts: any) {
      rz.instances.push(opts);
      this.on = () => {};
      this.open = () => { rz.opened++; };
    };
    setDoctor({ settings: { booking_advance_days: 7, slot_duration_minutes: 30, require_payment: true } });
    mock.current = createTableMock();
    mock.current.invoke.mockImplementation(async (fn: string) =>
      fn === "create-razorpay-order" ? { data: ORDER, error: null } : { data: null, error: null });
  });

  const gotoReview = async () => {
    await chooseDoctor(/Vikram Shah/);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /Review Booking Summary/ });
  };

  it("shows four steps and sends the chosen doctor with the payment order", async () => {
    render(<BookingWidget />);
    expect(screen.getByText("Review & pay", { selector: "span" })).toBeInTheDocument();
    await gotoReview();
    expect(screen.getAllByText("Dr. Vikram Shah").length).toBeGreaterThan(1); // review (and the aside) name the doctor
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() => expect(rz.opened).toBe(1));
    expect(orderCalls()[0][1].body).toMatchObject({ doctor_id: "doc-1", practitioner_id: "pb", amount: 1200, time_slot: "15:00" });
    expect(rz.instances[0].name).toBe("Dr. Vikram Shah");
  });

  it("PRACTITIONER_NOT_BOOKABLE from the order shows the doctor message", async () => {
    mock.current.invoke.mockImplementation(async () => ({
      data: null, error: { context: { status: 409, json: async () => ({ error: "PRACTITIONER_NOT_BOOKABLE" }) } },
    }));
    render(<BookingWidget />);
    await gotoReview();
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith("Booking not completed", { description: "This doctor is not taking bookings right now." }));
    expect(rz.opened).toBe(0);
  });

  it("INVALID_SERVICE from the order shows the service message", async () => {
    mock.current.invoke.mockImplementation(async () => ({
      data: null, error: { context: { status: 400, json: async () => ({ error: "INVALID_SERVICE" }) } },
    }));
    render(<BookingWidget />);
    await gotoReview();
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith("Booking not completed", { description: "This doctor doesn't offer that service. Please choose another service or doctor." }));
    expect(rz.opened).toBe(0);
  });

  it("changing doctor after an abandoned order drops it, and the new order names the new doctor", async () => {
    render(<BookingWidget />);
    await gotoReview();
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() => expect(rz.opened).toBe(1));
    act(() => rz.instances[0].modal.ondismiss());
    // Back to details, then When, then change the doctor.
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[1]);
    await screen.findByLabelText(/^Full name/);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByRole("heading", { name: "Select Time Slot" });
    fireEvent.click(screen.getByRole("button", { name: "Change doctor" }));
    await chooseDoctor(/Asha Rao/);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    continueWithTime();
    await screen.findByLabelText(/^Full name/);
    expect(screen.getByLabelText(/^Full name/)).toHaveValue("Ravi Kumar"); // patient details kept
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /Review Booking Summary/ });
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() => expect(rz.opened).toBe(2));
    expect(orderCalls()).toHaveLength(2);
    expect(orderCalls()[1][1].body).toMatchObject({ practitioner_id: "pa", time_slot: "09:00", amount: 750 });
  });
});
