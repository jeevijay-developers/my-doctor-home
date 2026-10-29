import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppointmentsPage from "./AppointmentsPage";

const { rpc, updates, row, profile } = vi.hoisted(() => ({
  // Stable identity: the page reloads whenever `profile` changes.
  profile: { id: "doctor-1", consultation_fee: 500 },
  rpc: vi.fn(),
  updates: [] as unknown[],
  row: {
    id: "appt-1", doctor_id: "doctor-1", patient_name: "Ravi Kumar", patient_phone: "9876543210", patient_age: 40,
    patient_gender: null, patient_email: null, service_name: "Clinic Visit", appointment_type: "clinic",
    date: "2026-10-29", time_slot: null, status: "pending", payment_status: "pay_at_clinic", amount: 300,
    token_number: "TABCDEFG", chief_complaint: null, notes: null, queue_number: 1, sort_time: "10:00:00",
    created_at: "2026-10-29T04:30:00Z", reschedule_count: 0, zoom_meeting_id: null, meeting_link: null,
    payment_method: null, serving_started_at: null, skipped_at: null,
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile, loading: false, isStaff: false, can: () => true, refetch: vi.fn() }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any =>
    Object.assign(Promise.resolve(resolved), {
      select: () => chain(resolved),
      eq: () => chain(resolved),
      in: () => chain(resolved),
      or: () => chain(resolved),
      neq: () => chain(resolved),
      order: () => chain(resolved),
      range: () => Promise.resolve(resolved),
      update: (patch: unknown) => { updates.push(patch); return chain({ data: [{ id: "appt-1" }], error: null }); },
    });
  return {
    supabase: {
      from: vi.fn(() => chain({ data: [row], count: 1, error: null })),
      rpc: (...args: unknown[]) => rpc(...args),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

async function openCompleteMenu() {
  render(<MemoryRouter><AppointmentsPage /></MemoryRouter>);
  const trigger = await screen.findByRole("button", { name: /change status for ravi kumar/i });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: /^complete$/i }));
}

describe("AppointmentsPage - completing an unpaid visit", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    updates.length = 0;
  });

  it("asks how the patient paid, records it, then completes", async () => {
    await openCompleteMenu();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/collect ₹300/i)).toBeInTheDocument();
    expect(updates).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "UPI" }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith("queue_action", { _action: "mark_paid", _appointment_id: "appt-1", _payment_method: "upi" });
    expect(updates[0]).toMatchObject({ status: "completed" });
  });

  it("lets the doctor complete without payment, which records no payment", async () => {
    await openCompleteMenu();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /complete without payment/i }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(rpc).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "completed" });
  });

  it("does not complete when recording the payment fails", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "ALREADY_SETTLED" }, error: null });
    await openCompleteMenu();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cash" }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(updates).toHaveLength(0);
  });
});
