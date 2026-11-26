import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LiveQueue from "./LiveQueue";
import { clinicToday } from "@/lib/queue";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";

const { rows, rpc, h } = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  h: { practitioners: null as any, profile: null as any },
}));

Element.prototype.scrollIntoView = vi.fn();

vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.practitioners }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => h.profile }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (): any => {
    const result = Promise.resolve({ data: rows, error: null });
    return Object.assign(result, { eq: () => chain(), order: () => chain() });
  };
  return {
    supabase: {
      from: vi.fn(() => ({ select: () => chain() })),
      rpc: (...args: unknown[]) => rpc(...args),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
      removeChannel: vi.fn(),
    },
  };
});

const base = {
  service_name: "Clinic Visit",
  payment_method: null,
  amount: 300,
  time_slot: null,
  created_at: "2026-10-28T15:30:00Z",
  serving_started_at: null,
  skipped_at: null,
  completed_at: null,
  priority: 0,
  priority_reason: null,
  appointment_type: "clinic",
  status: "pending",
  payment_status: "paid",
};

const setRows = (...list: Record<string, unknown>[]) => rows.splice(0, rows.length, ...list);

const doc = (id: string, display_name: string, slug: string, over: Record<string, unknown> = {}) => ({
  id, display_name, slug, specialization: null, is_active: true, is_bookable: true, is_primary: false, ...over,
});
const DR_A = doc("pa", "Dr. Asha Rao", "asha-rao", { is_primary: true });
const DR_B = doc("pb", "Dr. Bina Shah", "bina-shah");

const setPractitioners = (isMulti: boolean) => {
  const all = isMulti ? [DR_A, DR_B] : [DR_A];
  h.practitioners = {
    practitioners: all, active: all, bookable: all, primary: DR_A,
    byId: (id: string) => all.find((p) => p.id === id),
    access: { enabled: isMulti, has_feature: true }, isMulti, loading: false, refetch: vi.fn(),
  };
};
const setLogin = (role: "owner" | "staff" | "doctor", myPractitionerId: string | null, perms: string[] = []) => {
  h.profile = {
    role, myPractitionerId, isStaff: role !== "owner",
    can: (k: string) => role === "owner" || perms.includes(k),
  };
};

beforeEach(() => {
  setPractitioners(false);
  setLogin("owner", "pa");
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
  setRows();
});

describe("LiveQueue", () => {
  it("shows who is being served, who is waiting and how many are done", async () => {
    setRows(
      { ...base, id: "1", patient_name: "Asha Done", queue_number: 1, sort_time: "21:00:00", status: "completed", serving_started_at: "2026-10-28T15:00:00Z", completed_at: "2026-10-28T15:10:00Z" },
      { ...base, id: "2", patient_name: "Ravi Serving", queue_number: 2, sort_time: "21:05:00", serving_started_at: new Date().toISOString() },
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
      { ...base, id: "4", patient_name: "Karan Waiting", queue_number: 4, sort_time: "21:15:00" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    expect(await screen.findByText("Ravi Serving")).toBeInTheDocument();
    expect(screen.getByText("Meena Waiting")).toBeInTheDocument();
    expect(screen.getByText("Karan Waiting")).toBeInTheDocument();
    expect(screen.getByText(/^Next/)).toBeInTheDocument();
    expect(screen.getByText(/1 ahead/)).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("starts the time window as the whole day and offers a reset once narrowed", async () => {
    setRows(
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
      { ...base, id: "4", patient_name: "Karan Waiting", queue_number: 4, sort_time: "22:15:00" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    const from = (await screen.findByLabelText("From")) as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    expect(from.value).toBe("00:00");
    expect(to.value).toBe("23:59");
    expect(screen.queryByRole("button", { name: /reset to full day/i })).not.toBeInTheDocument();
    expect(screen.getByText("Karan Waiting")).toBeInTheDocument();

    fireEvent.change(to, { target: { value: "21:30" } });
    expect(screen.queryByText("Karan Waiting")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reset to full day/i }));
    expect(from.value).toBe("00:00");
    expect(to.value).toBe("23:59");
    expect(screen.getByText("Karan Waiting")).toBeInTheDocument();
  });

  it("calls the next patient through the server function", async () => {
    setRows({ ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" });
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /call next patient/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("queue_action", { _action: "call_next", _appointment_id: null, _reason: null, _payment_method: null, _expect: "none" }),
    );
  });

  it("asks how an unpaid patient paid before completing and calling the next one", async () => {
    setRows(
      { ...base, id: "2", patient_name: "Ravi Serving", queue_number: 2, sort_time: "21:05:00", serving_started_at: new Date().toISOString(), payment_status: "pending" },
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /complete & call next/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/collect ₹300/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "UPI" }));

    // UPI needs its UTR before anything is sent.
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm payment/i }));
    expect(await within(dialog).findByText(/12-digit UTR/i)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/UTR \/ UPI reference no/i), { target: { value: "412345678901" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm payment/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0][1]).toMatchObject({
      _action: "mark_paid", _appointment_id: "2", _payment_method: "upi", _payment_reference: "412345678901",
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({ _action: "call_next", _expect: "2" });
  });

  it("asks for payment before calling someone else out of order while an unpaid patient is in the room", async () => {
    setRows(
      { ...base, id: "2", patient_name: "Ravi Serving", queue_number: 2, sort_time: "21:05:00", serving_started_at: new Date().toISOString(), payment_status: "pending" },
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /call now/i }));
    expect(rpc).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm payment/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0][1]).toMatchObject({ _action: "mark_paid", _appointment_id: "2", _payment_method: "cash" });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("_payment_reference");
    expect(rpc.mock.calls[1][1]).toMatchObject({ _action: "call", _appointment_id: "3", _expect: "2" });
  });

  it("refreshes and explains when another device already changed the room", async () => {
    const { toast } = await import("sonner");
    rpc.mockResolvedValue({ data: { ok: false, error: "STALE" }, error: null });
    setRows({ ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" });
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /call next patient/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/another device/i)));
  });

  it("completes a paid patient and calls the next without a payment prompt", async () => {
    setRows(
      { ...base, id: "2", patient_name: "Ravi Serving", queue_number: 2, sort_time: "21:05:00", serving_started_at: new Date().toISOString() },
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /complete & call next/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0][1]).toMatchObject({ _action: "call_next" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts priority patients first and shows the reason", async () => {
    setRows(
      { ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" },
      { ...base, id: "4", patient_name: "Karan Urgent", queue_number: 4, sort_time: "21:15:00", priority: 1, priority_reason: "Chest pain" },
    );
    render(<LiveQueue doctorId="d1" canAct />);

    const first = (await screen.findAllByText(/Meena Waiting|Karan Urgent/))[0];
    expect(first).toHaveTextContent("Karan Urgent");
    expect(screen.getByText("Chest pain")).toBeInTheDocument();
  });

  it("is read-only without edit permission", async () => {
    setRows({ ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" });
    render(<LiveQueue doctorId="d1" canAct={false} />);

    expect(await screen.findByText("Meena Waiting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call next patient/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call now/i })).not.toBeInTheDocument();
  });

  it("reports a server refusal instead of pretending it worked", async () => {
    const { toast } = await import("sonner");
    rpc.mockResolvedValue({ data: { ok: false, error: "FORBIDDEN" }, error: null });
    setRows({ ...base, id: "3", patient_name: "Meena Waiting", queue_number: 3, sort_time: "21:10:00" });
    render(<LiveQueue doctorId="d1" canAct />);

    fireEvent.click(await screen.findByRole("button", { name: /call next patient/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/permission/i)));
  });

  describe("multi-doctor clinic", () => {
    const multiRows = () => setRows(
      { ...base, id: "1", practitioner_id: "pa", patient_name: "Ravi Serving", queue_number: 1, sort_time: "21:00:00", serving_started_at: new Date().toISOString() },
      { ...base, id: "2", practitioner_id: "pa", patient_name: "Meena Waiting", queue_number: 2, sort_time: "21:05:00" },
      { ...base, id: "3", practitioner_id: "pb", patient_name: "Karan Waiting", queue_number: 1, sort_time: "21:10:00" },
    );

    beforeEach(() => setPractitioners(true));

    const openTab = async (name: RegExp) => {
      const tab = await screen.findByRole("tab", { name });
      tab.focus();
      fireEvent.click(tab);
      return tab;
    };

    const openTransfer = async (patient: string) => {
      const trigger = await screen.findByRole("button", { name: new RegExp(`more actions for ${patient}`, "i") });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
      fireEvent.click(await screen.findByRole("menuitem", { name: /transfer to/i }));
      return screen.findByRole("dialog");
    };

    it("starts on All: shows each doctor's room, the combined line, and disables Call next", async () => {
      multiRows();
      render(<LiveQueue doctorId="d1" doctorSlug="clinic" canAct />);

      expect(await screen.findByRole("tab", { name: /^all/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Ravi Serving")).toBeInTheDocument();
      expect(screen.getByText("Meena Waiting")).toBeInTheDocument();
      expect(screen.getByText("Karan Waiting")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /call next patient/i })).toBeDisabled();
      expect(screen.getByText("Choose a doctor tab to call the next patient")).toBeInTheDocument();
    });

    it("a doctor tab shows only that doctor's line and calls next for that doctor", async () => {
      multiRows();
      render(<LiveQueue doctorId="d1" doctorSlug="clinic" canAct />);

      await openTab(/bina shah/i);
      expect(await screen.findByText("Karan Waiting")).toBeInTheDocument();
      expect(screen.queryByText("Meena Waiting")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", expect.stringContaining("/dr/clinic/queue?doctor=bina-shah"));

      fireEvent.click(screen.getByRole("button", { name: /call next patient/i }));
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("queue_action", {
          _action: "call_next", _appointment_id: null, _reason: null, _payment_method: null, _expect: "none", _practitioner_id: "pb",
        }),
      );
    });

    it("'Complete & call next' in a doctor tab expects that doctor's patient and passes the doctor", async () => {
      multiRows();
      render(<LiveQueue doctorId="d1" canAct />);

      await openTab(/asha rao/i);
      fireEvent.click(await screen.findByRole("button", { name: /complete & call next/i }));
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(rpc.mock.calls[0][1]).toMatchObject({ _action: "call_next", _expect: "1", _practitioner_id: "pa" });
    });

    it("transfers a waiting patient to another doctor", async () => {
      multiRows();
      render(<LiveQueue doctorId="d1" canAct />);

      await openTab(/asha rao/i);
      const dialog = await openTransfer("Meena Waiting");
      const transfer = within(dialog).getByRole("button", { name: /^transfer$/i });
      expect(transfer).toBeDisabled();
      fireEvent.click(within(dialog).getByRole("combobox", { name: /doctor/i }));
      const option = await screen.findByRole("option", { name: /bina shah/i });
      // The patient's current doctor is not offered.
      expect(screen.queryByRole("option", { name: /asha rao/i })).not.toBeInTheDocument();
      fireEvent.click(option);
      fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "Dr. Rao running late" } });
      fireEvent.click(transfer);

      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(rpc.mock.calls[0][1]).toMatchObject({
        _action: "transfer", _appointment_id: "2", _practitioner_id: "pb", _reason: "Dr. Rao running late",
      });
    });

    it("shows the doctor message when the other doctor's slot is taken", async () => {
      const { toast } = await import("sonner");
      rpc.mockResolvedValue({ data: { ok: false, error: "SLOT_TAKEN" }, error: null });
      multiRows();
      render(<LiveQueue doctorId="d1" canAct />);

      await openTab(/asha rao/i);
      const dialog = await openTransfer("Meena Waiting");
      fireEvent.click(within(dialog).getByRole("combobox", { name: /doctor/i }));
      fireEvent.click(await screen.findByRole("option", { name: /bina shah/i }));
      fireEvent.click(within(dialog).getByRole("button", { name: /^transfer$/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(practitionerErrorMessage("SLOT_TAKEN")));
    });

    it("keeps showing the loading state while the clinic's doctors load (no false 'Nobody in the room')", async () => {
      setLogin("doctor", "pb", ["appointments.view"]);
      multiRows();
      setPractitioners(false);
      h.practitioners.loading = true;
      const { rerender } = render(<LiveQueue doctorId="d1" canAct />);
      await new Promise((r) => setTimeout(r, 20)); // the first load has long since resolved
      expect(screen.getByText(/loading today's queue/i)).toBeInTheDocument();
      expect(screen.queryByText(/nobody in the room/i)).not.toBeInTheDocument();

      setPractitioners(true);
      rerender(<LiveQueue doctorId="d1" canAct />);
      // Rows fetched before the clinic was known to be multi-doctor carry no doctor: do not render them.
      expect(screen.getByText(/loading today's queue/i)).toBeInTheDocument();
      expect(await screen.findByText("Karan Waiting")).toBeInTheDocument();
      expect(screen.queryByText(/nobody in the room/i)).not.toBeInTheDocument();
    });

    it("a doctor login without all-doctors access sees only their own tab", async () => {
      setLogin("doctor", "pb", ["appointments.view", "appointments.edit"]);
      multiRows();
      render(<LiveQueue doctorId="d1" canAct />);

      expect(await screen.findByText("Karan Waiting")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^all/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /asha rao/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Meena Waiting")).not.toBeInTheDocument();
      expect(screen.queryByText("Ravi Serving")).not.toBeInTheDocument();
    });

    it("a doctor login with all-doctors access starts on their own tab", async () => {
      setLogin("doctor", "pb", ["appointments.view", "appointments.all_doctors"]);
      multiRows();
      render(<LiveQueue doctorId="d1" canAct />);

      expect(await screen.findByRole("tab", { name: /bina shah/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /^all/i })).toBeInTheDocument();
    });
  });

  it("looks up today's queue in the clinic's time zone", () => {
    expect(clinicToday(new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-28");
  });
});
