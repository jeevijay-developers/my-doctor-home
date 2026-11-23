import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SAImportRequests from "./SAImportRequests";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const ROWS = [
  { id: "r1", doctor_id: "d1", requested_cap: 5000, doctor_note: "Moving my old list", patient_count: 1900, cap_at_request: 2000,
    status: "pending", approved_cap: null, reviewer_note: null, decided_at: null, created_at: "2026-11-20T10:00:00Z",
    profiles: { full_name: "Asha Rao", clinic_name: "Rao Clinic", plan_tier: "pro" } },
  { id: "r2", doctor_id: "d2", requested_cap: 9000, doctor_note: null, patient_count: 100, cap_at_request: 2000,
    status: "rejected", approved_cap: null, reviewer_note: "Too large", decided_at: "2026-11-19T10:00:00Z", created_at: "2026-11-18T10:00:00Z",
    profiles: { full_name: "Ravi K", clinic_name: null, plan_tier: "pro" } },
];

const renderIt = (canManage = true) =>
  render(
    <SuperAdminAccessProvider value={buildSuperAdminAccess(false, canManage ? { "plan_requests.manage": true } : {})}>
      <SAImportRequests />
    </SuperAdminAccessProvider>,
  );

const openReview = async () => {
  fireEvent.click((await screen.findAllByRole("button", { name: /review/i }))[0]);
  return (await screen.findByLabelText(/approved limit/i)) as HTMLInputElement;
};
const approve = () => fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
const reviewCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "review_patient_import_request");

describe("SAImportRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.patient_import_requests = { data: ROWS };
    mock.current.rpcs.review_patient_import_request = () => ({ data: null, error: null });
  });

  it("lists pending requests with the numbers a reviewer needs, and earlier decisions below", async () => {
    renderIt();
    expect((await screen.findAllByText("Asha Rao")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,900 patients now/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/asks for 5,000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Moving my old list/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ravi K").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Too large/).length).toBeGreaterThan(0);
  });

  it("formats dates in IST, not the browser's zone", async () => {
    // 2026-11-20T20:00Z is already 21 Nov in India.
    mock.current.tables.patient_import_requests = { data: [{ ...ROWS[0], created_at: "2026-11-20T20:00:00Z" }] };
    renderIt();
    expect((await screen.findAllByText(/Nov 21, 2026/)).length).toBeGreaterThan(0);
  });

  it("shows empty states", async () => {
    mock.current.tables.patient_import_requests = { data: [] };
    renderIt();
    expect(await screen.findByText("No limit requests waiting.")).toBeInTheDocument();
    expect(screen.getByText("Nothing decided yet.")).toBeInTheDocument();
  });

  it("copes with a request whose doctor profile is missing", async () => {
    mock.current.tables.patient_import_requests = { data: [{ ...ROWS[0], profiles: null }] };
    renderIt();
    expect((await screen.findAllByText("Unknown doctor")).length).toBeGreaterThan(0);
    await openReview();
    expect(screen.getByText(/Unknown doctor has 1,900 patients/)).toBeInTheDocument();
  });

  it("shows an inline error with a retry when loading fails", async () => {
    mock.current.tables.patient_import_requests = { data: null, error: { message: "boom" } };
    renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
    mock.current.tables.patient_import_requests = { data: ROWS };
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect((await screen.findAllByText("Asha Rao")).length).toBeGreaterThan(0);
  });

  it("approves with the cap the reviewer enters", async () => {
    renderIt();
    const cap = await openReview();
    expect(cap.value).toBe("5000");
    fireEvent.change(cap, { target: { value: "4000" } });
    approve();
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("review_patient_import_request", { _request_id: "r1", _decision: "approve", _approved_cap: 4000, _note: null }),
    );
  });

  it.each([["", "empty"], ["0", "zero"], ["2147483648", "past 32-bit"], ["99999999999999999999", "huge"]])(
    "will not approve a cap of %s (%s)", async (value) => {
      renderIt();
      const cap = await openReview();
      fireEvent.change(cap, { target: { value } });
      approve();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a valid limit" }));
      expect(reviewCalls()).toHaveLength(0);
    },
  );

  it("strips non-digits from the cap field", async () => {
    renderIt();
    const cap = await openReview();
    fireEvent.change(cap, { target: { value: "-4e3.5" } });
    expect(cap.value).toBe("435");
  });

  it("accepts the largest storable cap", async () => {
    renderIt();
    const cap = await openReview();
    fireEvent.change(cap, { target: { value: "2147483647" } });
    approve();
    await waitFor(() => expect(reviewCalls()[0][1]._approved_cap).toBe(2147483647));
  });

  it("warns, but leaves the verdict to the server, when the cap is not above the old limit", async () => {
    mock.current.rpcs.review_patient_import_request = () => ({ data: null, error: { message: "The approved limit must be above the current limit (2000) and at most 100000" } });
    renderIt();
    const cap = await openReview();
    fireEvent.change(cap, { target: { value: "1500" } });
    expect(screen.getByText(/not above the limit when asked/i)).toBeInTheDocument();
    approve();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save decision", description: expect.stringContaining("must be above") })));
    // dialog stays open so the reviewer can fix the number
    expect(screen.getByLabelText(/approved limit/i)).toBeInTheDocument();
  });

  it("will not decline without a reason", async () => {
    renderIt();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" }));
    expect(reviewCalls()).toHaveLength(0);
  });

  it("declines with the reason the doctor will see", async () => {
    renderIt();
    await openReview();
    expect(screen.getByLabelText(/the doctor sees this/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/note to the doctor/i), { target: { value: "Please import in smaller batches" } });
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("review_patient_import_request", { _request_id: "r1", _decision: "reject", _approved_cap: null, _note: "Please import in smaller batches" }),
    );
  });

  it("limits the note length", async () => {
    renderIt();
    await openReview();
    expect(screen.getByLabelText(/note to the doctor/i)).toHaveAttribute("maxlength", "500");
  });

  it("sends one request on a double click and ignores Escape while saving", async () => {
    let release: (v: unknown) => void = () => {};
    mock.current.rpcs.review_patient_import_request = () => new Promise((r) => { release = r; });
    renderIt();
    await openReview();
    const btn = screen.getByRole("button", { name: /^approve$/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(reviewCalls()).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release({ data: null, error: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes the dialog and reloads when the request was already decided", async () => {
    mock.current.rpcs.review_patient_import_request = () => ({ data: null, error: { message: "This request is already approved" } });
    renderIt();
    await openReview();
    const before = mock.current.client.from.mock.calls.length;
    approve();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save decision" }));
    expect(mock.current.client.from.mock.calls.length).toBeGreaterThan(before);
  });

  it("is view-only without plan_requests.manage", async () => {
    renderIt(false);
    await openReview();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^decline$/i })).toBeDisabled();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
