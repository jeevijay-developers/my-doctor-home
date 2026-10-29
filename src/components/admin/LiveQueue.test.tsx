import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LiveQueue from "./LiveQueue";
import { clinicToday } from "@/lib/queue";

const { rows, rpc } = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rpc: vi.fn(),
}));

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

beforeEach(() => {
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

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0][1]).toMatchObject({ _action: "mark_paid", _appointment_id: "2", _payment_method: "upi" });
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Cash" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0][1]).toMatchObject({ _action: "mark_paid", _appointment_id: "2", _payment_method: "cash" });
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

  it("looks up today's queue in the clinic's time zone", () => {
    expect(clinicToday(new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-28");
  });
});
