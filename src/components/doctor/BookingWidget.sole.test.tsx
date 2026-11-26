import "./__test__/intersectionObserverVisibleStub";
import { continueWithTime, pickTomorrow, timeField } from "./__test__/bookingFlow";
// A clinic that lists two or more doctors but where only ONE can be booked online
// (the other has online booking off or is outside the seats), plus refused bookings.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  doctor: {} as any,
  toastError: vi.fn(),
  refresh: vi.fn(async () => ({})),
  refreshPractitioners: vi.fn(async () => {}),
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
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), info: vi.fn() } }));
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
const DR_A = doc({ online_booking: false, bookable: false });
const DR_B = doc({
  id: "pb", display_name: "Dr. Vikram Shah", slug: "vikram-shah", consultation_fee: 1200, slot_duration_minutes: 60,
  is_primary: false, sort_order: 1,
});
const DR_C = doc({ id: "pc", display_name: "Dr. Meera Iyer", slug: "meera-iyer", is_primary: false, sort_order: 2 });

const setDoctor = (over: Record<string, unknown> = {}) => {
  h.doctor = {
    profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha", clinic_name: "Sunrise Clinic" },
    services: [],
    settings: { booking_advance_days: 7, slot_duration_minutes: 30 },
    // The context hands the widget only the bookable doctor's rows when it is not multi-doctor.
    workingHours: days("pb", "15:00", "17:00"),
    allWorkingHours: days("pb", "15:00", "17:00"),
    rawWorkingHours: [...days("pa", "09:00", "12:00"), ...days("pb", "15:00", "17:00")],
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_B],
    soleBookable: DR_B,
    isMultiDoctor: false,
    isPremium: true,
    hasFeature: () => false,
    refreshPractitioners: h.refreshPractitioners,
    ...over,
  };
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

describe("BookingWidget (clinic with several doctors but one bookable)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.slotArgs = [];
    setDoctor();
    mock.current = createTableMock();
    mock.current.tables.appointments = { data: { id: "appt-1" }, error: null };
  });

  it("goes straight to When with that doctor's hours, no picker and no Change button", async () => {
    render(<BookingWidget />);
    expect(screen.queryByRole("radiogroup", { name: "Doctor" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("03:00 PM"));
    expect(screen.getAllByText("Dr. Vikram Shah").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Change doctor" })).not.toBeInTheDocument();
    expect(h.slotArgs.some((a) => a[0] === "doc-1" && typeof a[1] === "string" && a[3] === "pb")).toBe(true);
  });

  it("books with that doctor's id and fee", async () => {
    render(<BookingWidget />);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking · ₹1200/ }));
    await waitFor(() => expect(inserts()).toHaveLength(1));
    expect(insertedRow()).toMatchObject({ doctor_id: "doc-1", practitioner_id: "pb", time_slot: "15:00", amount: 1200 });
  });

  it("sends practitioner_id with the payment order", async () => {
    setDoctor({ settings: { booking_advance_days: 7, slot_duration_minutes: 30, require_payment: true } });
    mock.current.invoke.mockImplementation(async () => ({ data: null, error: null }));
    (window as any).Razorpay = function (this: any) { this.on = () => {}; this.open = () => {}; };
    render(<BookingWidget />);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /Review Booking Summary/ });
    fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalled());
    expect(mock.current.invoke.mock.calls[0][0]).toBe("create-razorpay-order");
    expect(mock.current.invoke.mock.calls[0][1].body).toMatchObject({ practitioner_id: "pb", amount: 1200 });
  });

  it("a select-doctor event for that doctor works; one for the non-bookable doctor is ignored", async () => {
    render(<BookingWidget />);
    act(() => { window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "pa" } })); });
    expect(screen.getAllByText("Dr. Vikram Shah").length).toBeGreaterThan(0);
    act(() => { window.dispatchEvent(new CustomEvent("doctylia:select-doctor", { detail: { id: "pb" } })); });
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
  });

  it("refused as not bookable: shows the message and reloads the doctor list", async () => {
    mock.current.tables.appointments = { data: null, error: { message: "PRACTITIONER_NOT_BOOKABLE" } };
    render(<BookingWidget />);
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("This doctor is not taking bookings right now."));
    expect(h.refreshPractitioners).toHaveBeenCalled();
  });
});

describe("BookingWidget (several doctors, refused bookings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.slotArgs = [];
    setDoctor({
      workingHours: [], allWorkingHours: [...days("pb", "15:00", "17:00"), ...days("pc", "09:00", "12:00")],
      practitioners: [DR_B, DR_C], bookablePractitioners: [DR_B, DR_C], soleBookable: null, isMultiDoctor: true,
    });
    mock.current = createTableMock();
    mock.current.tables.appointments = { data: null, error: { message: "SEAT_LIMIT" } };
  });

  it("clears the doctor, stops offering them, shows the message and reloads the list", async () => {
    render(<BookingWidget />);
    const group = await screen.findByRole("radiogroup", { name: "Doctor" });
    fireEvent.click(within(group).getByRole("radio", { name: /Vikram Shah/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await gotoDetails("03:00 PM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/seats are in use/)));
    expect(h.refreshPractitioners).toHaveBeenCalled();
    const again = await screen.findByRole("radiogroup", { name: "Doctor" });
    const radios = within(again).getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveTextContent("Meera Iyer");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
  });
});

describe("BookingWidget (no open days / failed doctor list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.slotArgs = [];
    mock.current = createTableMock();
  });

  it("a selected doctor with no open hours shows a message and a way to choose another doctor", async () => {
    setDoctor({
      workingHours: [], allWorkingHours: [...days("pc", "09:00", "12:00")],
      practitioners: [DR_B, DR_C], bookablePractitioners: [DR_B, DR_C], soleBookable: null, isMultiDoctor: true,
    });
    render(<BookingWidget />);
    const group = await screen.findByRole("radiogroup", { name: "Doctor" });
    fireEvent.click(within(group).getByRole("radio", { name: /Vikram Shah/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Dr. Vikram Shah has no online hours right now.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Select Date" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose another doctor" }));
    expect(await screen.findByRole("radiogroup", { name: "Doctor" })).toBeInTheDocument();
  });

  it("with the doctor list unavailable, a REQUIRED refusal asks to reload and refreshes the list", async () => {
    setDoctor({
      workingHours: days("", "09:00", "12:00"), allWorkingHours: days("", "09:00", "12:00"), rawWorkingHours: [],
      practitioners: [], bookablePractitioners: [], soleBookable: null, isMultiDoctor: false, practitionersError: true,
    });
    mock.current.tables.appointments = { data: null, error: { message: "PRACTITIONER_REQUIRED" } };
    render(<BookingWidget />);
    await gotoDetails("09:00 AM");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /Confirm booking/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Please reload the page to choose your doctor."));
    expect(h.refreshPractitioners).toHaveBeenCalled();
  });
});
