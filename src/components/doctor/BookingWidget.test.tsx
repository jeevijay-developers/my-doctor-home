import "./__test__/intersectionObserverVisibleStub";
import { continueWithTime, dateField, pickTomorrow, timeField } from "./__test__/bookingFlow";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  doctor: {} as any,
  features: { online_consultation: false } as Record<string, boolean>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(async () => ({})),
  counts: {} as Record<string, number>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: () => h.doctor }));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
vi.mock("@/hooks/useSlotAvailability", () => ({
  useSlotAvailability: () => ({ counts: h.counts, isFull: (slot: string) => (h.counts[slot] || 0) >= 1, bookedIn: (slot: string) => h.counts[slot] || 0, refresh: h.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
vi.mock("./motion/scroll", () => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
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

// One "When" screen: the first bookable date and its earliest free time are already chosen; Continue moves on.
const gotoDetails = async () => {
  await pickTomorrow(); // tomorrow: never has past slots
  await screen.findByRole("heading", { name: "Select Time Slot" });
  await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM")); // earliest free time is preselected
  continueWithTime();
  await screen.findByLabelText(/^Full name/);
};

const fillDetails = (over: Record<string, string> = {}) => {
  const v = { name: "Ravi Kumar", phone: "9876500001", age: "40", email: "", reason: "Headache for three days", ...over };
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: v.name } });
  fireEvent.change(screen.getByLabelText(/^Mobile number/), { target: { value: v.phone } });
  if (v.email) fireEvent.change(screen.getByLabelText("Email"), { target: { value: v.email } });
  fireEvent.change(screen.getByLabelText(/^Age/), { target: { value: v.age } });
  fireEvent.change(screen.getByLabelText(/^Gender/), { target: { value: "male" } });
  fireEvent.change(screen.getByLabelText(/^Reason for visit/), { target: { value: v.reason } });
};

const book = () => fireEvent.click(screen.getByRole("button", { name: /Confirm booking · ₹/ }));
const inserts = () =>
  mock.current.opsOf("appointments").filter((q: any) => q.ops.some((o: any[]) => o[0] === "insert"));

describe("BookingWidget (pay at clinic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.features = { online_consultation: false };
    h.counts = {};
    setDoctor();
    mock.current = createTableMock();
    mock.current.tables.appointments = { data: { id: "appt-1" }, error: null };
  });

  it("offers no consultation-type choice when online consultation is not on the plan", () => {
    render(<BookingWidget />);
    expect(screen.queryByRole("radiogroup", { name: "Consultation type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Online/ })).not.toBeInTheDocument();
  });

  it("offers Online next to Clinic Visit when the doctor has the online_consultation feature", () => {
    h.features = { online_consultation: true };
    render(<BookingWidget />);
    expect(screen.getByRole("radio", { name: /Clinic Visit/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Online/ }));
    expect(screen.getByRole("radio", { name: /Online/ })).toHaveAttribute("aria-checked", "true");
  });

  it("starts with the first bookable date and its earliest free time already chosen", async () => {
    render(<BookingWidget />);
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}$/ })).toBeInTheDocument();
    expect(timeField()).toHaveTextContent(/^\d{2}:\d{2} (AM|PM)$/);
    expect(screen.getByRole("button", { name: /^Continue · / })).toBeEnabled();
  });

  it("shows every field up front: required ones marked *, email and reason with no optional tag", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    expect(screen.getByLabelText(/^Full name/)).toHaveFocus();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add email or reason/ })).not.toBeInTheDocument();
    for (const label of [/^Full name/, /^Mobile number/, /^Age/, /^Gender/, /^Reason for visit/]) {
      expect(screen.getByText(label, { selector: "label" }).textContent).toContain("*");
    }
    expect(screen.getByText("Email", { selector: "label" }).textContent).not.toContain("*");
  });

  it("lays the form out as name, then mobile + email, then age + gender, then reason", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    const order = ["Full name", "Mobile number", "Email", "Age", "Gender", "Reason for visit"].map((l) => screen.getByLabelText(new RegExp(`^${l}`)));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Mobile and email share a row; so do age and gender.
    expect(order[1].closest(".grid")).toBe(order[2].closest(".grid"));
    expect(order[3].closest(".grid")).toBe(order[4].closest(".grid"));
    expect(order[0].closest(".grid")).not.toBe(order[1].closest(".grid"));
  });

  it("gender is a dropdown of Male, Female and Other", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    const gender = screen.getByLabelText(/^Gender/) as HTMLSelectElement;
    expect(gender.tagName).toBe("SELECT");
    expect(gender.value).toBe("");
    expect([...gender.options].map((o) => o.textContent)).toEqual(["Select gender", "Male", "Female", "Other"]);
  });

  it("the reason for visit is required: without it the booking is not sent and the field gets the focus", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails({ reason: "  " });
    book();
    expect(await screen.findByRole("alert")).toHaveTextContent(/reason for visit/);
    expect(screen.getByLabelText(/^Reason for visit/)).toHaveFocus();
    expect(inserts()).toHaveLength(0);
  });

  it("tells the patient about a wrong phone number when they leave the field, not while they are still typing", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    const phone = screen.getByLabelText(/^Mobile number/);
    fireEvent.change(phone, { target: { value: "98765" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.blur(phone);
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid/i);
  });

  it("never leaves a dead button: tapping it explains what is missing and moves to the first empty field", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    const confirm = screen.getByRole("button", { name: /Confirm booking/ });
    expect(confirm).toBeEnabled();
    expect(screen.getByText(/Enter your name, mobile number, age, gender and reason for visit/)).toBeInTheDocument();
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter your name, mobile number, age, gender and reason for visit/);
    expect(screen.getByLabelText(/^Full name/)).toHaveFocus();
    expect(inserts()).toHaveLength(0);
    // with the name given, the next empty field (mobile number) gets the focus
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: "Ravi Kumar" } });
    fireEvent.click(confirm);
    expect(screen.getByLabelText(/^Mobile number/)).toHaveFocus();
    fillDetails();
    expect(screen.queryByText(/Enter your name, mobile number, age, gender and reason for visit/)).not.toBeInTheDocument();
  });

  it("submits from the keyboard (Enter / the phone's Go key)", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    fireEvent.submit(screen.getByLabelText(/^Full name/).closest("form")!);
    await waitFor(() => expect(inserts()).toHaveLength(1));
  });

  it("a service picked after a booking is confirmed starts a fresh booking instead of rewriting the confirmation", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    await screen.findByRole("button", { name: "Book Another" });
    window.dispatchEvent(new CustomEvent("doctylia:select-service", { detail: { id: null, type: "clinic" } }));
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book Another" })).not.toBeInTheDocument();
  });

  it("uses the profile fee for the default consultation and a custom service's own price", () => {
    setDoctor({ services: [{ id: "s1", name: "ECG", price: 300, duration: 20, type: "clinic", active: true }] });
    render(<BookingWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Change service" }));
    const list = within(screen.getByRole("radiogroup", { name: "Service" }));
    expect(list.getByText("₹750")).toBeInTheDocument();
    expect(list.getByText("ECG")).toBeInTheDocument();
    expect(list.getByText("₹300")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Change service" }));
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("OnlineOnly")).not.toBeInTheDocument();
    expect(screen.getByText("BothOk")).toBeInTheDocument();
  });

  it("falls back to the default fee for a service with no price, never showing ₹0 for a priced default", () => {
    setDoctor({ services: [{ id: "s1", name: "Unpriced", price: null, type: "clinic", active: true }] });
    render(<BookingWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Change service" }));
    // Both the default consultation and the unpriced service show the default fee in the list.
    expect(within(screen.getByRole("radiogroup", { name: "Service" })).getAllByText("₹750").length).toBe(2);
  });

  it("shows a free (₹0) consultation as ₹0, not ₹500", () => {
    setDoctor({
      profile: { id: "doc-1", full_name: "Asha Rao", consultation_fee: 0, slug: "asha" },
      services: [{ id: "s1", name: "ECG", price: 300, duration: 20, type: "clinic", active: true }],
    });
    render(<BookingWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Change service" }));
    expect(screen.queryByText("₹500")).not.toBeInTheDocument();
  });

  it("with no open day at all, says so instead of offering a calendar to nowhere", async () => {
    setDoctor({ workingHours: allDaysOpen.map((w) => ({ ...w, is_open: false })) });
    render(<BookingWidget />);
    expect(await screen.findByText(/No dates are open for booking right now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue · / })).not.toBeInTheDocument();
  });

  it("closed days are greyed out in the calendar", async () => {
    setDoctor({ workingHours: allDaysOpen.map((w) => ({ ...w, is_open: w.day_of_week !== 0 })) }); // closed Sundays
    render(<BookingWidget />);
    fireEvent.click(await screen.findByRole("button", { name: /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}$/ }));
    const days = [...document.querySelectorAll<HTMLButtonElement>('button[name="day"]')];
    expect(days.length).toBeGreaterThan(0);
    // A Sunday inside the booking window can't be chosen, and every open day can.
    const window = new Set(Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 86_400_000).getDate()));
    const sunday = new Date(Date.now() + ((7 - new Date().getDay()) % 7) * 86_400_000).getDate();
    const sundayButton = days.find((b) => Number(b.textContent) === sunday && window.has(sunday));
    if (sundayButton) expect(sundayButton).toBeDisabled();
    expect(days.some((b) => !b.disabled)).toBe(true);
  });

  it("offers times from the doctor's working hours at their slot length: 09-12 in 30 minutes", async () => {
    render(<BookingWidget />);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    fireEvent.click(timeField());
    const options = (name: string) => within(screen.getByRole("radiogroup", { name })).getAllByRole("radio").map((r) => r.textContent);
    expect(options("Hour")).toEqual(["09", "10", "11"]); // nothing from 12:00 on
    expect(options("Minute")).toEqual(["00", "30"]);
    expect(within(screen.getByRole("radiogroup", { name: "AM or PM" })).getByRole("radio", { name: "PM" })).toBeDisabled();
  });

  it("hides times that are already booked: they are not in the hour or minute lists, and the count drops", async () => {
    h.counts = { "09:00": 1, "10:30": 1 };
    render(<BookingWidget />);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:30 AM")); // 09:00 is taken, so the first free time is 09:30
    expect(screen.getByText("4 available")).toBeInTheDocument();
    fireEvent.click(timeField());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Hour" })).getByRole("radio", { name: "10" }));
    const minutes = within(screen.getByRole("radiogroup", { name: "Minute" })).getAllByRole("radio").map((r) => r.textContent);
    expect(minutes).toEqual(["00"]); // 10:30 is booked
  });

  it("when every time of a day is booked, says so and does not offer Continue", async () => {
    h.counts = Object.fromEntries(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map((t) => [t, 1]));
    render(<BookingWidget />);
    await pickTomorrow();
    expect(await screen.findByText(/No time slots are available for this date/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue · / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No times available" })).toBeDisabled();
  });

  it("picking a different time in the columns changes what Continue will book", async () => {
    render(<BookingWidget />);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    fireEvent.click(timeField());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Hour" })).getByRole("radio", { name: "11" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Minute" })).getByRole("radio", { name: "30" }));
    expect(screen.getByRole("button", { name: "Continue · 11:30 AM" })).toBeInTheDocument();
    continueWithTime();
    await screen.findByLabelText(/^Full name/);
    fillDetails();
    book();
    await waitFor(() => expect(inserts()).toHaveLength(1));
    expect(inserts()[0].ops.find((o: any[]) => o[0] === "insert")[1]).toMatchObject({ time_slot: "11:30" });
  });

  it("shows Checking… while the chosen time is re-checked live, then moves on", async () => {
    render(<BookingWidget />);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    let release!: (counts: Record<string, number>) => void;
    h.refresh.mockImplementationOnce(() => new Promise((res) => { release = res; }));
    continueWithTime();
    expect(await screen.findByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(dateField()).toBeDisabled(); // cannot wander off mid-check
    release({});
    await screen.findByLabelText(/^Full name/);
  });

  it("quick-book from the hero opens the details with that date and time chosen, after a live re-check", async () => {
    render(<BookingWidget />);
    await screen.findByRole("heading", { name: "Select Date" });
    const tomorrow = new Date(Date.now() + 86_400_000);
    const dateKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    let release!: (counts: Record<string, number>) => void;
    h.refresh.mockImplementationOnce(() => new Promise((res) => { release = res; }));
    window.dispatchEvent(new CustomEvent("doctylia:select-slot", { detail: { dateKey, time: "10:00", type: "clinic" } }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    await waitFor(() => expect(dateField()).toBeDisabled()); // locked while the slot is re-checked
    release({});
    await screen.findByLabelText(/^Full name/);
    expect(screen.getByText("10:00 AM")).toBeInTheDocument(); // the summary shows the quick-booked time
  });

  it("a time the patient picked stays when they switch to another day", async () => {
    render(<BookingWidget />);
    await pickTomorrow();
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
    fireEvent.click(timeField());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Hour" })).getByRole("radio", { name: "11" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Minute" })).getByRole("radio", { name: "30" }));
    // Day after tomorrow (next month's page if needed).
    const target = new Date(Date.now() + 2 * 86_400_000);
    fireEvent.click(dateField());
    const find = () => [...document.querySelectorAll<HTMLButtonElement>('button[name="day"]')].find((b) => b.textContent === String(target.getDate()) && !b.disabled);
    let day = find();
    if (!day) {
      fireEvent.click(screen.getByRole("button", { name: "Go to next month" }));
      day = find();
    }
    fireEvent.click(day!);
    await waitFor(() => expect(timeField()).toHaveTextContent("11:30 AM"));
  });

  it("going Back keeps the time that was chosen", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
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

  it("success shows the confirmation screen, with a calendar file, and does not pop the slip open by itself", async () => {
    render(<BookingWidget />);
    await gotoDetails();
    fillDetails();
    book();
    expect(await screen.findByRole("button", { name: "Book Another" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download Appointment Slip/ })).toBeInTheDocument();
  });
});
