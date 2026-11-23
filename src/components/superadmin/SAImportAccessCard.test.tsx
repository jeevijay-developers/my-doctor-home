import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SAImportAccessCard from "./SAImportAccessCard";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const PLAN_ONLY = { eligible: true, cap: 2000, patient_count: 40, override: null, reason: "ok_plan", plan_tier: "pro", plan_status: "active", plan_end: "2999-01-01T00:00:00Z" };
const setCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "set_patient_import_override");

describe("SAImportAccessCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.get_doctor_import_access = () => ({ data: PLAN_ONLY, error: null });
    mock.current.rpcs.set_patient_import_override = () => ({ data: null, error: null });
  });

  it("shows the clinic's access, limit and patient count, and that the plan includes it", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/import is on/i)).toBeInTheDocument();
    expect(screen.getByText(/40 of 2,000 patients/)).toBeInTheDocument();
    expect(screen.getByText("Included in the Pro plan")).toBeInTheDocument();
  });

  it("names Premium when the plan is premium", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({ data: { ...PLAN_ONLY, plan_tier: "premium" }, error: null });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText("Included in the Premium plan")).toBeInTheDocument();
  });

  describe("plan_not_eligible causes", () => {
    const off = (extra: Record<string, unknown>) => {
      mock.current.rpcs.get_doctor_import_access = () => ({
        data: { eligible: false, cap: 0, patient_count: 3, override: null, reason: "plan_not_eligible", plan_end: null, ...extra },
        error: null,
      });
    };

    it("free plan", async () => {
      off({ plan_tier: "free", plan_status: "active" });
      render(<SAImportAccessCard doctorId="d1" canManage />);
      expect(await screen.findByText("Not on a paid plan (current plan: free, status active)")).toBeInTheDocument();
    });

    it("paid tier whose status is not active", async () => {
      off({ plan_tier: "pro", plan_status: "cancelled" });
      render(<SAImportAccessCard doctorId="d1" canManage />);
      expect(await screen.findByText("Plan is cancelled")).toBeInTheDocument();
    });

    it("paid period ended", async () => {
      off({ plan_tier: "premium", plan_status: "active", plan_end: "2020-03-04T06:00:00Z" });
      render(<SAImportAccessCard doctorId="d1" canManage />);
      expect(await screen.findByText(/^Paid period ended on /)).toBeInTheDocument();
      expect(screen.getByText(/2020/)).toBeInTheDocument();
    });

    it("otherwise just says not eligible", async () => {
      off({ plan_tier: "pro", plan_status: "active", plan_end: "2999-01-01T00:00:00Z" });
      render(<SAImportAccessCard doctorId="d1" canManage />);
      expect(await screen.findByText("Not eligible")).toBeInTheDocument();
    });
  });

  it("uses the server's override reason codes", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { ...PLAN_ONLY, eligible: false, reason: "blocked_override", override: { mode: "blocked", until: null, reason: "abuse", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText("Blocked by superadmin: abuse")).toBeInTheDocument();
  });

  it("falls back to the old wording when the server sends no reason", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({ data: { eligible: true, cap: 2000, patient_count: 1, override: null }, error: null });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText("Included in the Pro/Premium plan")).toBeInTheDocument();
  });

  it("says a free or trial clinic is not on a paid plan", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({ data: { eligible: false, cap: 0, patient_count: 3, override: null }, error: null });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/import is off/i)).toBeInTheDocument();
    expect(screen.getByText(/not on a paid plan/i)).toBeInTheDocument();
  });

  it("shows an active block with its reason", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: false, cap: 2000, patient_count: 40, override: { mode: "blocked", until: null, reason: "abuse", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/import is off/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked by superadmin/i)).toBeInTheDocument();
    expect(screen.getByText(/abuse/)).toBeInTheDocument();
  });

  it("explains an allow override differently from the plan", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: true, cap: 2000, patient_count: 1, override: { mode: "allowed", until: "2999-01-01T18:29:59Z", reason: "support", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/allowed by superadmin until/i)).toBeInTheDocument();
    expect(screen.queryByText(/included in the pro/i)).not.toBeInTheDocument();
  });

  it("treats an override whose end date has passed as no longer applying", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: false, cap: 0, patient_count: 1, override: { mode: "allowed", until: "2020-01-01T00:00:00Z", reason: "old", set_at: "2019-12-01T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/no longer applies/i)).toBeInTheDocument();
    expect(screen.queryByText(/^allowed by superadmin/i)).not.toBeInTheDocument();
    expect(screen.getByText(/not on a paid plan/i)).toBeInTheDocument();
  });

  it("shows a loading state, then the card", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    await screen.findByText(/import is on/i);
  });

  it("shows an inline error with retry when loading fails, and recovers", async () => {
    let fail = true;
    mock.current.rpcs.get_doctor_import_access = () => (fail ? { data: null, error: { message: "boom" } } : { data: PLAN_ONLY, error: null });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/import is on/i)).toBeInTheDocument();
  });

  it("refetches when the doctor changes and drops the old form", async () => {
    mock.current.rpcs.get_doctor_import_access = ({ _doctor_id }: any) => ({
      data: { ...PLAN_ONLY, patient_count: _doctor_id === "d1" ? 40 : 7 },
      error: null,
    });
    const { rerender } = render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "x" } });
    rerender(<SAImportAccessCard doctorId="d2" canManage />);
    expect(await screen.findByText(/7 of 2,000 patients/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
  });

  it("will not save an override without a reason", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" }));
    expect(setCalls()).toHaveLength(0);
  });

  it("rejects a whitespace-only reason", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" }));
    expect(setCalls()).toHaveLength(0);
  });

  it("saves a block with its trimmed reason", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "  Scripted bulk inserts " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", { _doctor_id: "d1", _mode: "blocked", _until: null, _reason: "Scripted bulk inserts" }),
    );
  });

  it("sends the end date as end of that day in IST", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^allow import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "support" } });
    fireEvent.change(screen.getByLabelText(/ends on/i), { target: { value: "2999-03-04" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", {
        _doctor_id: "d1",
        _mode: "allowed",
        _until: "2999-03-04T18:29:59.000Z",
        _reason: "support",
      }),
    );
  });

  it("rejects an end date in the past without calling the server", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "abuse" } });
    fireEvent.change(screen.getByLabelText(/ends on/i), { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "End date must be in the future" }));
    expect(setCalls()).toHaveLength(0);
  });

  it("sends only one request when Save is double-clicked", async () => {
    let release: (v: unknown) => void = () => {};
    mock.current.rpcs.set_patient_import_override = () => new Promise((r) => { release = r; });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "abuse" } });
    const save = screen.getByRole("button", { name: /^save$/i });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(setCalls()).toHaveLength(1);
    release({ data: null, error: null });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Override saved" })));
  });

  it("keeps the typed reason when switching between Block and Allow", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "ticket 9" } });
    fireEvent.click(screen.getByRole("button", { name: /^allow import$/i }));
    expect(screen.getByLabelText(/reason/i)).toHaveValue("ticket 9");
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", expect.objectContaining({ _mode: "allowed", _reason: "ticket 9" })),
    );
  });

  it("Cancel closes the form and clears the fields", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "oops" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^block import$/i }));
    expect(screen.getByLabelText(/reason/i)).toHaveValue("");
  });

  it("keeps the form open and shows the server's message when saving fails", async () => {
    mock.current.rpcs.set_patient_import_override = () => ({ data: null, error: { message: "not allowed" } });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "abuse" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save", description: "not allowed" })));
    expect(screen.getByLabelText(/reason/i)).toHaveValue("abuse");
  });

  it("clears an override", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: true, cap: 2000, patient_count: 40, override: { mode: "allowed", until: null, reason: "support", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /clear override/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", { _doctor_id: "d1", _mode: "clear", _until: null, _reason: null }),
    );
  });

  it("hides the buttons when the viewer cannot manage", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage={false} />);
    await screen.findByText(/import is on/i);
    expect(screen.queryByRole("button", { name: /block import/i })).not.toBeInTheDocument();
  });
});
