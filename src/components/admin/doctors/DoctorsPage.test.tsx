import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DoctorsPage from "./DoctorsPage";
import { createTableMock } from "@/test/tableMock";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { PERMISSION_PRESETS } from "@/lib/staffPermissions";

Element.prototype.scrollIntoView = vi.fn();

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  role: "owner" as "owner" | "staff" | "doctor",
  isStaff: false,
  granted: [] as string[],
  state: null as any,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "clinic-1", consultation_fee: 500 };
  return {
    useProfile: () => ({
      profile,
      loading: false,
      isStaff: h.isStaff,
      role: h.role,
      can: (k: string) => !h.isStaff || h.granted.includes(k),
    }),
  };
});
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.state }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("../LockedFeatureCard", () => ({ default: ({ featureName }: any) => <div>LOCKED:{featureName}</div> }));

const doc = (id: string, display_name: string, over: Record<string, unknown> = {}) => ({
  id, doctor_id: "clinic-1", display_name, slug: id, specialization: null, qualifications: null,
  experience_years: null, bio: null, photo_url: null, signature_url: null, registration_number: null,
  consultation_fee: null, slot_duration_minutes: null, online_booking: true, directory_listed: true,
  is_active: true, is_bookable: true, is_primary: false, sort_order: 1, user_id: null, hpr_id: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over,
});

const OWNER = doc("p-owner", "Dr. Asha Rao", { is_primary: true, user_id: "clinic-1", sort_order: 0, specialization: "Cardiologist" });
const BINA = doc("p-bina", "Dr. Bina Shah", { consultation_fee: 700 });

const setState = (over: Record<string, unknown> = {}, list = [OWNER, BINA]) => {
  const active = list.filter((p) => p.is_active);
  h.state = {
    practitioners: list,
    active,
    bookable: active.filter((p) => p.is_bookable),
    primary: list.find((p) => p.is_primary) ?? null,
    byId: (id: string) => list.find((p) => p.id === id),
    access: { enabled: true, has_feature: true, seat_limit: 3, seats_used: 2, extra_seats: 2, seat_max: 10, seat_price: null },
    isMulti: active.length >= 2,
    loading: false,
    refetch: vi.fn(async () => {}),
    ...over,
  };
};

// The table mock treats a returned object that has an `error` key as a full { data, error }
// answer, so RPC payloads (which carry their own `error`) are wrapped explicitly.
const ok = (data: unknown) => ({ data, error: null });

const renderPage = () =>
  render(
    <MemoryRouter>
      <DoctorsPage />
    </MemoryRouter>,
  );

describe("DoctorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.client.storage = {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    };
    mock.current.tables.staff_members = { data: [] };
    h.role = "owner";
    h.isStaff = false;
    h.granted = [];
    setState();
  });

  it("shows the locked card when the plan has no multi-doctor feature", () => {
    setState({ access: { enabled: false, has_feature: false, seat_limit: 1, seats_used: 1 } }, [OWNER]);
    renderPage();
    expect(screen.getByText("LOCKED:Multiple Doctors")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add doctor/i })).not.toBeInTheDocument();
  });

  it("lapsed plan with 2 active doctors: full page, banner, add/resume disabled, other actions work, over-seat badge", async () => {
    const CARL = doc("p-carl", "Dr. Carl", { sort_order: 2, is_bookable: false });
    setState({ access: { enabled: false, has_feature: false, seat_limit: 1, seats_used: 2, extra_seats: 0, seat_max: 10, seat_price: null } }, [OWNER, BINA, CARL]);
    renderPage();
    expect(screen.queryByText("LOCKED:Multiple Doctors")).not.toBeInTheDocument();
    expect(screen.getByText(/Your plan no longer includes extra doctors/)).toBeInTheDocument();
    screen.getAllByRole("button", { name: /add doctor/i }).forEach((b) => expect(b).toBeDisabled());
    screen.getAllByRole("button", { name: /resume bookings for dr\. carl/i }).forEach((b) => expect(b).toBeDisabled());
    screen.getAllByRole("button", { name: /deactivate dr\. bina shah/i }).forEach((b) => expect(b).toBeEnabled());
    screen.getAllByRole("button", { name: /stop bookings for dr\. bina shah/i }).forEach((b) => expect(b).toBeEnabled());
    screen.getAllByRole("button", { name: /edit dr\. bina shah/i }).forEach((b) => expect(b).toBeEnabled());
    expect(screen.getAllByText(/Not taking bookings \(over seat limit\)/).length).toBeGreaterThan(0);
    // main doctor is within the single seat
    const ownerRow = screen.getAllByText("Dr. Asha Rao")[0].closest("tr")!;
    expect(within(ownerRow).queryByText(/over seat limit/)).not.toBeInTheDocument();
  });

  it("has_feature but not enabled with 2 active doctors still shows the page", () => {
    setState({ access: { enabled: false, has_feature: true, seat_limit: 2, seats_used: 2 } });
    renderPage();
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
    expect(screen.getByText(/Your plan no longer includes extra doctors/)).toBeInTheDocument();
  });

  it("access unavailable (null) with 2 active doctors still shows the page without crashing", () => {
    setState({ access: null });
    renderPage();
    expect(screen.getAllByText("Dr. Bina Shah").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /add doctor/i })).toBeDisabled();
  });

  it("says coming soon, with no actions, when the feature is not switched on yet", () => {
    setState({ access: { enabled: false, has_feature: true, seat_limit: 1, seats_used: 1 } }, [OWNER]);
    renderPage();
    expect(screen.getByText(/Multiple doctors is coming soon for your clinic/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add doctor/i })).not.toBeInTheDocument();
  });

  it("lists the doctors with seat usage, and keeps the owner's personal fields read-only", async () => {
    renderPage();
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute("href", "/admin/support");
    expect(screen.getAllByText("Dr. Asha Rao").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dr. Bina Shah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Main doctor").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Edit your name, photo and signature in Profile/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /profile/i }).some((a) => a.getAttribute("href") === "/admin/profile")).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit Dr. Asha Rao" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^Name/)).toBeDisabled();
    expect(within(dialog).getByText(/Edit your name, photo and signature in Profile/)).toBeInTheDocument();
    // Booking fields stay editable on the owner's row.
    expect(within(dialog).getByLabelText(/Consultation fee/)).not.toBeDisabled();
  });

  it("shows the seat message when creating a doctor hits SEAT_LIMIT", async () => {
    mock.current.rpcs.upsert_practitioner = () => ok({ ok: false, error: "SEAT_LIMIT" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /add doctor/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Dr. New Person" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save/i }));
    expect(await within(dialog).findByText(practitionerErrorMessage("SEAT_LIMIT")!)).toBeInTheDocument();
    expect(mock.current.rpc).toHaveBeenCalledWith("upsert_practitioner", expect.objectContaining({ _id: null }));
  });

  it("deactivating a doctor with upcoming bookings offers to move them, then retries", async () => {
    let statusCalls = 0;
    mock.current.rpcs.set_practitioner_status = () => {
      statusCalls += 1;
      // After the move only the clashing booking is left, so the retry is still refused.
      return ok({ ok: false, error: "HAS_FUTURE_APPOINTMENTS", count: statusCalls === 1 ? 3 : 1 });
    };
    mock.current.rpcs.reassign_practitioner_appointments = () => ok({ ok: true, moved: 2, skipped: ["ap-1"] });
    mock.current.tables.appointments = { data: [{ id: "ap-1", date: "2026-12-01", time_slot: "10:00:00", patient_name: "Ravi Kumar" }] };

    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate Dr. Bina Shah" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));

    expect(await within(dialog).findByText(/3 upcoming/)).toBeInTheDocument();
    expect(mock.current.rpc).toHaveBeenCalledWith("set_practitioner_status", { _id: "p-bina", _is_active: false, _is_bookable: false });
    fireEvent.click(within(dialog).getByRole("button", { name: /move bookings/i }));

    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("reassign_practitioner_appointments", { _from: "p-bina", _to: "p-owner" }),
    );
    expect(await within(dialog).findByText(/Moved 2/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ravi Kumar/)).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(await within(dialog).findByText(/still has 1 upcoming appointment./)).toBeInTheDocument();
  });

  it("shows the per-booking reason from skipped_reasons when the database gives one", async () => {
    mock.current.rpcs.set_practitioner_status = () => ok({ ok: false, error: "HAS_FUTURE_APPOINTMENTS", count: 1 });
    mock.current.rpcs.reassign_practitioner_appointments = () =>
      ok({ ok: true, moved: 0, skipped: ["ap-1"], skipped_reasons: [{ id: "ap-1", reason: "SLOT_TAKEN" }] });
    mock.current.tables.appointments = { data: [{ id: "ap-1", date: "2026-12-01", time_slot: "10:00:00", patient_name: "Ravi Kumar" }] };
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate Dr. Bina Shah" })[0]);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));
    fireEvent.click(await within(dialog).findByRole("button", { name: /move bookings/i }));
    expect(await within(dialog).findByText(/The other doctor already has a patient at that time/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ravi Kumar/)).toBeInTheDocument();
  });

  it("the owner creates a login for a doctor through create-staff-account", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Create login for Dr. Bina Shah" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Phone/), { target: { value: "+919876543210" } });
    fireEvent.change(within(dialog).getByLabelText(/^Confirm phone/), { target: { value: "+919876543210" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create login/i }));
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalled());
    const [fn, opts] = mock.current.invoke.mock.calls[0];
    expect(fn).toBe("create-staff-account");
    expect(opts.body).toEqual({
      role: "doctor",
      practitioner_id: "p-bina",
      staff_name: "Dr. Bina Shah",
      phone: "+919876543210",
      permissions: Object.fromEntries(PERMISSION_PRESETS.doctor.map((k) => [k, true])),
    });
  });

  it("staff without practitioners.manage see the list but no action buttons", () => {
    h.role = "staff";
    h.isStaff = true;
    h.granted = ["practitioners.view"];
    renderPage();
    expect(screen.getAllByText("Dr. Bina Shah").length).toBeGreaterThan(0);
    for (const name of [/add doctor/i, /^Edit /, /^Hours /, /^Deactivate /, /^Make .* main doctor/, /^Stop bookings/, /^Create login/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});
