import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { format, addHours } from "date-fns";
import ManageAppointment from "./ManageAppointment";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/VideoConsultationCard", () => ({ default: () => <div>VIDEO-CARD</div> }));

const appt = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  doctor_id: "d1",
  patient_name: "Ravi Kumar",
  patient_phone: "9876500001",
  service_name: "General Consultation",
  appointment_type: "online",
  date: "2999-05-20",
  time_slot: "10:00",
  status: "confirmed",
  token_number: "TK7M2QX9",
  amount: 500,
  reschedule_count: 0,
  chief_complaint: null,
  meeting_link: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const renderPage = (url = "/dr/asha/manage") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dr/:slug/manage" element={<ManageAppointment />} />
      </Routes>
    </MemoryRouter>,
  );

const lookupBtn = () => screen.getByRole("button", { name: /Find My Appointment/ });
const fillAndFind = async (token = "tk7m2qx9", phone = "9876500001") => {
  await waitFor(() => expect(mock.current.rpc).not.toBeUndefined());
  fireEvent.change(screen.getByLabelText("Token Number"), { target: { value: token } });
  fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: phone } });
  await waitFor(() => expect(lookupBtn()).toBeEnabled());
  fireEvent.click(lookupBtn());
};

describe("ManageAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    const t = mock.current.tables;
    t.profiles = { data: { id: "d1", full_name: "Asha Rao", slug: "asha" } };
    t.website_settings = { data: { cancellation_cutoff_hours: 2, booking_advance_days: 7 } };
    t.working_hours = { data: [] };
    mock.current.rpcs.get_appointment_by_token = () => [appt()];
    mock.current.rpcs.get_upcoming_checkup = () => null;
    mock.current.rpcs.get_slot_counts = () => [];
    mock.current.rpcs.cancel_appointment_by_token = () => ({ ok: true });
    mock.current.rpcs.reschedule_appointment_by_token = () => ({ ok: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("disables lookup until both token and phone are entered", async () => {
    renderPage();
    expect(lookupBtn()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Token Number"), { target: { value: "X" } });
    expect(lookupBtn()).toBeDisabled();
  });

  it("looks up with the normalized token (upper-case) and trimmed phone for this clinic only", async () => {
    renderPage();
    await fillAndFind("tk7m2qx9", " 9876500001 ");
    await screen.findByText("#TK7M2QX9");
    const call = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "get_appointment_by_token");
    expect(call[1]).toEqual({ _doctor_id: "d1", _token: "TK7M2QX9", _phone: "9876500001" });
  });

  it("passes the looked-up token to get_upcoming_checkup so wrong guesses count toward the lockout", async () => {
    renderPage();
    await fillAndFind();
    await screen.findByText("Ravi Kumar");
    const call = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "get_upcoming_checkup");
    expect(call[1]._token).toBe("TK7M2QX9");
  });

  it("shows the appointment details with the date formatted", async () => {
    renderPage();
    await fillAndFind();
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("General Consultation")).toBeInTheDocument();
    expect(screen.getByText("Mon, 20 May 2999")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });

  it("tells the patient when nothing matches", async () => {
    mock.current.rpcs.get_appointment_by_token = () => [];
    renderPage();
    await fillAndFind();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No appointment found with that token and phone number."));
  });

  it("locked-out lookups explain the 15 minute wait (and are not 'not found')", async () => {
    mock.current.rpcs.get_appointment_by_token = () => ({ data: null, error: { message: "TOO_MANY_ATTEMPTS" } });
    renderPage();
    await fillAndFind();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/15 minutes/)));
  });

  it("a network failure is not reported as 'no appointment found'", async () => {
    mock.current.rpcs.get_appointment_by_token = () => ({ data: null, error: { message: "fetch failed" } });
    renderPage();
    await fillAndFind();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not reach the server/)));
  });

  it("missing clinic shows an alert and keeps lookup disabled", async () => {
    mock.current.tables.profiles = { data: null, error: { code: "PGRST116", message: "none" } };
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not find this clinic/);
    fireEvent.change(screen.getByLabelText("Token Number"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "9" } });
    expect(lookupBtn()).toBeDisabled();
  });

  it("a failed clinic request is a retryable network error, not 'missing'", async () => {
    mock.current.tables.profiles = { data: null, error: { code: "500", message: "boom" } };
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/check your connection/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers Reschedule and Cancel for a confirmed booking well in the future", async () => {
    renderPage();
    await fillAndFind();
    expect(await screen.findByRole("button", { name: /Reschedule/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.getByText("VIDEO-CARD")).toBeInTheDocument();
  });

  it("hides reschedule/cancel and explains when the visit is inside the cancellation cutoff", async () => {
    const soon = addHours(new Date(), 1);
    mock.current.rpcs.get_appointment_by_token = () => [
      appt({ date: format(soon, "yyyy-MM-dd"), time_slot: format(soon, "HH:mm") }),
    ];
    renderPage();
    await fillAndFind();
    expect(await screen.findByText(/too close to be changed online/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reschedule/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument();
  });

  it("honours the clinic's own cutoff hours setting", async () => {
    mock.current.tables.website_settings = { data: { cancellation_cutoff_hours: 24, booking_advance_days: 7 } };
    const later = addHours(new Date(), 10);
    mock.current.rpcs.get_appointment_by_token = () => [
      appt({ date: format(later, "yyyy-MM-dd"), time_slot: format(later, "HH:mm") }),
    ];
    renderPage();
    await fillAndFind();
    expect(await screen.findByText(/too close to be changed online/)).toBeInTheDocument();
  });

  it("after two reschedules only Cancel remains, with an explanation", async () => {
    mock.current.rpcs.get_appointment_by_token = () => [appt({ reschedule_count: 2 })];
    renderPage();
    await fillAndFind();
    expect(await screen.findByText(/Maximum reschedules reached/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reschedule/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Rescheduled/)).toBeInTheDocument();
  });

  it("completed or cancelled bookings cannot be changed", async () => {
    for (const status of ["completed", "cancelled", "no_show"]) {
      mock.current.rpcs.get_appointment_by_token = () => [appt({ status })];
      const { unmount } = renderPage();
      await fillAndFind();
      await screen.findByText("Ravi Kumar");
      expect(screen.queryByRole("button", { name: /Reschedule/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Cancel/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("cancel asks for confirmation; declining sends nothing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await fillAndFind();
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("cancel_appointment_by_token", expect.anything());
  });

  it("confirmed cancel calls the RPC with token+phone and shows the cancelled status", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await fillAndFind();
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Appointment cancelled."));
    const call = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "cancel_appointment_by_token");
    expect(call[1]).toEqual({ _doctor_id: "d1", _token: "TK7M2QX9", _phone: "9876500001" });
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("a server refusal on cancel shows its specific message and keeps the status", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mock.current.rpcs.cancel_appointment_by_token = () => ({ data: { ok: false, error: "TOO_CLOSE" }, error: null });
    renderPage();
    await fillAndFind();
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Too close/)));
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });

  it("reschedule view: confirm is disabled until a date and time are picked; shows remaining reschedules", async () => {
    renderPage();
    await fillAndFind();
    fireEvent.click(await screen.findByRole("button", { name: /Reschedule/ }));
    expect(await screen.findByRole("button", { name: /Confirm New Time/ })).toBeDisabled();
    expect(screen.getByText(/You have 2 reschedules remaining/)).toBeInTheDocument();
  });
});
