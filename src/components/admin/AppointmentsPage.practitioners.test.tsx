import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import AppointmentsPage from "./AppointmentsPage";
import { clinicToday } from "@/lib/queue";

Element.prototype.scrollIntoView = vi.fn();

type Call = [string, unknown[]];
type Query = { table: string; calls: Call[] };

const h = vi.hoisted(() => ({
  queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>,
  inserts: [] as unknown[],
  updates: [] as unknown[],
  rows: [] as unknown[],
  prac: null as any,
  prof: null as any,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => h.prof }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.prac }));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: true, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("./LiveQueue", () => ({ default: () => <div data-testid="live-queue-stub" /> }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (q: { calls: Array<[string, unknown[]]> }, resolved: () => unknown): any => {
    const self: any = {
      then: (ok: any, bad: any) => Promise.resolve(resolved()).then(ok, bad),
    };
    for (const m of ["select", "eq", "in", "or", "neq", "order", "range", "delete"]) {
      self[m] = (...args: unknown[]) => { q.calls.push([m, args]); return self; };
    }
    self.insert = (payload: unknown) => { h.inserts.push(payload); q.calls.push(["insert", [payload]]); return chain(q, () => ({ data: null, error: null })); };
    self.update = (patch: unknown) => { h.updates.push(patch); q.calls.push(["update", [patch]]); return chain(q, () => ({ data: [{ id: "x" }], error: null })); };
    return self;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        const q = { table, calls: [] as Array<[string, unknown[]]> };
        h.queries.push(q);
        return chain(q, () => ({ data: h.rows, count: h.rows.length, error: null }));
      }),
      rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

const doc = (id: string, display_name: string, over: Record<string, unknown> = {}) => ({
  id, display_name, specialization: null, is_active: true, is_bookable: true, is_primary: false, ...over,
});
const A = doc("a", "Dr. Asha Rao", { is_primary: true });
const B = doc("b", "Dr. Bina Shah");

const setPractitioners = (isMulti: boolean) => {
  const all = isMulti ? [A, B] : [A];
  h.prac = {
    practitioners: all, active: all, bookable: all, primary: A,
    byId: (id: string | null | undefined) => all.find((p) => p.id === id),
    access: { enabled: isMulti }, isMulti, loading: false, refetch: vi.fn(),
  };
};

// Stable identity: the page reloads whenever `profile` changes.
const PROFILE = { id: "doctor-1", consultation_fee: 500, slug: "dr-x" };
const setProfile = (over: Record<string, unknown> = {}) => {
  h.prof = {
    profile: PROFILE, loading: false, isStaff: false, can: () => true, refetch: vi.fn(),
    role: "owner", myPractitionerId: null, ...over,
  };
};

const today = clinicToday();
const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");

const hasEq = (q: Query, col: string, val?: unknown) =>
  q.calls.some(([m, args]) => m === "eq" && args[0] === col && (val === undefined || args[1] === val));
const appointmentQueries = () => h.queries.filter((q) => q.table === "appointments");
// The paged list query is the one that calls .range().
// (The calendar-dots query also pages with .range(), but selects only "date".)
const listQueries = () => appointmentQueries().filter((q) => q.calls.some(([m]) => m === "range") && q.calls.some(([m, a]) => m === "select" && a[0] === "*"));

const renderPage = (path = "/admin/appointments") =>
  render(<MemoryRouter initialEntries={[path]}><AppointmentsPage /></MemoryRouter>);

async function pick(container: HTMLElement, comboName: RegExp, option: RegExp | string) {
  fireEvent.click(within(container).getByRole("combobox", { name: comboName }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

async function openAndFillNewAppointment() {
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: /new appointment/i }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/patient name/i), { target: { value: "Ravi Kumar" } });
  fireEvent.change(within(dialog).getByLabelText(/phone/i), { target: { value: "9876543210" } });
  fireEvent.change(within(dialog).getByLabelText(/^age/i), { target: { value: "40" } });
  await pick(dialog, /gender/i, "Male");
  fireEvent.change(within(dialog).getByLabelText(/service/i), { target: { value: "Clinic Visit" } });
  fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: tomorrow } });
  await pick(dialog, /time slot/i, "10:00");
  return dialog;
}

describe("AppointmentsPage - per doctor", () => {
  beforeEach(() => {
    h.queries.length = 0;
    h.inserts.length = 0;
    h.updates.length = 0;
    h.rows = [];
    setPractitioners(false);
    setProfile();
  });

  it("single-doctor clinic: no doctor picker, and the booking sends no practitioner_id", async () => {
    const dialog = await openAndFillNewAppointment();
    expect(within(dialog).queryByRole("combobox", { name: /^doctor$/i })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /add appointment/i }));
    await waitFor(() => expect(h.inserts).toHaveLength(1));
    const payload = h.inserts[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ doctor_id: "doctor-1", patient_name: "Ravi Kumar", date: tomorrow, time_slot: "10:00" });
    expect(payload).not.toHaveProperty("practitioner_id");
    expect(appointmentQueries().some((q) => hasEq(q, "practitioner_id"))).toBe(false);
  });

  it("multi-doctor: Add is disabled until a doctor is picked; pre-check and insert carry the doctor", async () => {
    setPractitioners(true);
    const dialog = await openAndFillNewAppointment();
    const add = within(dialog).getByRole("button", { name: /add appointment/i });
    expect(add).toBeDisabled();

    await pick(dialog, /^doctor$/i, /Dr\. Bina Shah/);
    expect(add).toBeEnabled();
    fireEvent.click(add);

    await waitFor(() => expect(h.inserts).toHaveLength(1));
    expect(h.inserts[0]).toMatchObject({ doctor_id: "doctor-1", practitioner_id: "b", time_slot: "10:00" });
    const precheck = appointmentQueries().find((q) => hasEq(q, "time_slot", "10:00"));
    expect(precheck).toBeDefined();
    expect(hasEq(precheck!, "practitioner_id", "b")).toBe(true);
  });

  it("multi-doctor: rows show the doctor's name", async () => {
    setPractitioners(true);
    h.rows = [{
      id: "appt-1", doctor_id: "doctor-1", practitioner_id: "b", patient_name: "Ravi Kumar", patient_phone: "9876543210",
      service_name: "Clinic Visit", appointment_type: "clinic", date: today, time_slot: "10:00:00", status: "pending",
      payment_status: "pending", amount: 300, reschedule_count: 0,
    }];
    renderPage();
    expect((await screen.findAllByText("Dr. Bina Shah")).length).toBeGreaterThan(0);
  });

  it("multi-doctor reschedule: a same-day doctor change disables Save and points to the queue transfer", async () => {
    setPractitioners(true);
    h.rows = [{
      id: "appt-1", doctor_id: "doctor-1", practitioner_id: "a", patient_name: "Ravi Kumar", patient_phone: "9876543210",
      service_name: "Clinic Visit", appointment_type: "clinic", date: today, time_slot: "20:00:00", status: "pending",
      payment_status: "pending", amount: 300, reschedule_count: 0,
    }];
    renderPage();
    const [nameBtn] = await screen.findAllByRole("button", { name: "Ravi Kumar" });
    fireEvent.click(nameBtn);
    fireEvent.click(await screen.findByRole("button", { name: /^reschedule$/i }));
    const dialog = await screen.findByRole("dialog", { name: /reschedule appointment/i });
    const save = within(dialog).getByRole("button", { name: /save new slot/i });
    expect(save).toBeEnabled();

    await pick(dialog, /^doctor$/i, /Dr\. Bina Shah/);
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(/use transfer in the live queue/i)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: tomorrow } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0]).toMatchObject({ date: tomorrow, practitioner_id: "b", reschedule_count: 1 });
  });

  it("a doctor login without appointments.all_doctors sees only their own appointments by default", async () => {
    setPractitioners(true);
    setProfile({ role: "doctor", isStaff: true, myPractitionerId: "b", can: (k: string) => k !== "appointments.all_doctors" });
    renderPage();
    await waitFor(() => expect(listQueries().some((q) => hasEq(q, "practitioner_id", "b"))).toBe(true));
    const last = listQueries()[listQueries().length - 1];
    expect(hasEq(last, "practitioner_id", "b")).toBe(true);
  });

  it("a doctor login without all_doctors cannot widen the filter: no 'All doctors', locked to own id", async () => {
    setPractitioners(true);
    setProfile({ role: "doctor", isStaff: true, myPractitionerId: "b", can: (k: string) => k !== "appointments.all_doctors" });
    renderPage();
    const filter = await screen.findByRole("combobox", { name: /doctor filter/i });
    expect(filter).toBeDisabled();
    await waitFor(() => expect(listQueries().length).toBeGreaterThan(0));
    // Even the very first list query is already scoped (no flash of the whole clinic).
    expect(hasEq(listQueries()[0], "practitioner_id", "b")).toBe(true);
    expect(listQueries().every((q) => hasEq(q, "practitioner_id", "b"))).toBe(true);
  });

  it("reschedule still names the appointment's current doctor when they are no longer bookable", async () => {
    setPractitioners(true);
    h.prac = { ...h.prac, bookable: [A], active: [A, { ...B, is_bookable: false }], practitioners: [A, { ...B, is_bookable: false }] };
    h.rows = [{
      id: "appt-1", doctor_id: "doctor-1", practitioner_id: "b", patient_name: "Ravi Kumar", patient_phone: "9876543210",
      service_name: "Clinic Visit", appointment_type: "clinic", date: tomorrow, time_slot: "20:00:00", status: "pending",
      payment_status: "pending", amount: 300, reschedule_count: 0,
    }];
    renderPage();
    const [nameBtn] = await screen.findAllByRole("button", { name: "Ravi Kumar" });
    fireEvent.click(nameBtn);
    fireEvent.click(await screen.findByRole("button", { name: /^reschedule$/i }));
    const dialog = await screen.findByRole("dialog", { name: /reschedule appointment/i });
    expect(within(dialog).getByRole("combobox", { name: /^doctor$/i })).toHaveTextContent("Dr. Bina Shah");
  });

  it("the owner sees every doctor's appointments by default", async () => {
    setPractitioners(true);
    setProfile({ myPractitionerId: "a" });
    renderPage();
    await waitFor(() => expect(listQueries().length).toBeGreaterThan(0));
    expect(listQueries().some((q) => hasEq(q, "practitioner_id"))).toBe(false);
  });

  it("?tab=queue opens the live queue; without it the list shows", async () => {
    const { unmount } = renderPage("/admin/appointments?tab=queue");
    expect(await screen.findByTestId("live-queue-stub")).toBeInTheDocument();
    unmount();
    renderPage();
    await waitFor(() => expect(listQueries().length).toBeGreaterThan(0));
    expect(screen.queryByTestId("live-queue-stub")).not.toBeInTheDocument();
  });

  it("a doctor login has no New Appointment button and no doctor picker when rescheduling (and sends no practitioner_id)", async () => {
    setPractitioners(true);
    setProfile({ role: "doctor", isStaff: true, myPractitionerId: "a", can: (k: string) => k !== "appointments.all_doctors" });
    h.rows = [{
      id: "appt-1", doctor_id: "doctor-1", practitioner_id: "a", patient_name: "Ravi Kumar", patient_phone: "9876543210",
      service_name: "Clinic Visit", appointment_type: "clinic", date: today, time_slot: "20:00:00", status: "pending",
      payment_status: "pending", amount: 300, reschedule_count: 0,
    }];
    renderPage();
    const [nameBtn] = await screen.findAllByRole("button", { name: "Ravi Kumar" });
    expect(screen.queryByRole("button", { name: /new appointment/i })).not.toBeInTheDocument();
    fireEvent.click(nameBtn);
    fireEvent.click(await screen.findByRole("button", { name: /^reschedule$/i }));
    const dialog = await screen.findByRole("dialog", { name: /reschedule appointment/i });
    expect(within(dialog).queryByRole("combobox", { name: /^doctor$/i })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: tomorrow } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save new slot/i }));
    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0]).not.toHaveProperty("practitioner_id");
  });

  it("owner still sees the New Appointment button", () => {
    setPractitioners(true);
    renderPage();
    expect(screen.getByRole("button", { name: /new appointment/i })).toBeInTheDocument();
  });
});
