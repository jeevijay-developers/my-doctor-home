import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SASubscriptions from "./SASubscriptions";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissions } from "@/lib/superadminPermissions";
import { createTableMock } from "@/test/tableMock";

Element.prototype.scrollIntoView = vi.fn();

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/usePlanPrices", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePlanPrices")>("@/hooks/usePlanPrices");
  return { ...actual, usePlanPrices: () => ({ proPrice: 1499, premiumPrice: 3999, loading: false }) };
});
vi.mock("./BulkDeleteDoctorsDialog", () => ({
  default: () => <div>BULK-DELETE-DIALOG</div>,
}));

const rows = [
  {
    id: "d1", full_name: "Dr Asha", clinic_name: "Asha Clinic", email: "a@x.in", plan_tier: "pro", plan_status: "active",
    plan_end: "2999-01-01T00:00:00Z", trial_end: null, custom_plan_price: null, created_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "d2", full_name: "Dr Bala", clinic_name: "Bala Care", email: "b@x.in", plan_tier: "premium", plan_status: "active",
    plan_end: "2999-01-01T00:00:00Z", trial_end: null, custom_plan_price: 2999, created_at: "2026-09-02T00:00:00Z",
  },
];

const renderPage = (isOwner: boolean, perms: SAPermissions = {}) =>
  render(
    <SuperAdminAccessProvider value={buildSuperAdminAccess(isOwner, perms)}>
      <SASubscriptions />
    </SuperAdminAccessProvider>,
  );

describe("SASubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    const t = mock.current.tables;
    t.profiles = { data: rows };
    t.plan_upgrade_payments = { data: [] };
    t.pending_plans = { data: [] };
    t.doctor_custom_plans = { data: [] };
  });

  it("shows effective price per doctor in rupees (default vs custom)", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(screen.getAllByText("₹1499").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹2999").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Custom Pricing").length).toBeGreaterThan(0);
  });

  it("refuses a zero / empty / out-of-range custom price and writes nothing", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    const saves = screen.getAllByTitle("Save custom price");
    fireEvent.click(saves[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a price" })));
    const inputs = screen.getAllByPlaceholderText(/\d+/).filter((el) => el.tagName === "INPUT" && (el as HTMLInputElement).type !== "date");
    for (const bad of ["0", "100001"]) {
      toast.mockClear();
      fireEvent.change(inputs[0], { target: { value: bad } });
      fireEvent.click(saves[0]);
      await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invalid price" })));
    }
    const updates = mock.current.opsOf("profiles").filter((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(updates).toHaveLength(0);
  });

  it("saves a valid custom price for exactly that doctor", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    const inputs = screen.getAllByPlaceholderText(/\d+/).filter((el) => (el as HTMLInputElement).type !== "date");
    fireEvent.change(inputs[0], { target: { value: "1200" } });
    fireEvent.click(screen.getAllByTitle("Save custom price")[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Custom price saved" })));
    const upd = mock.current.opsOf("profiles").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ custom_plan_price: 1200 });
    expect(upd.ops.some((o: any[]) => o[0] === "eq" && o[1] === "id" && o[2] === "d1")).toBe(true);
  });

  it("refuses to set an expiry date in the past", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pick a future date" })));
  });

  it("sets plan expiry to 23:59:59 IST of the chosen day (18:29:59Z)", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2999-05-20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Expiry date updated" })));
    const upd = mock.current.opsOf("profiles").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ plan_end: "2999-05-20T18:29:59.000Z" });
  });

  it("view-only team member cannot save a custom price", async () => {
    renderPage(false, { "subscriptions.view": true });
    await screen.findAllByText("Dr Asha");
    for (const b of screen.getAllByTitle("Save custom price")) expect(b).toBeDisabled();
  });

  it("team member without doctors.delete cannot open bulk doctor deletion", async () => {
    renderPage(false, { "subscriptions.view": true, "subscriptions.manage": true });
    await screen.findAllByText("Dr Asha");
    fireEvent.click(screen.getAllByLabelText("Select all doctors")[0]);
    expect(screen.getByRole("button", { name: /Delete Selected/ })).toBeDisabled();
  });

  it("shows an error toast, not success, when RLS filtered the custom-price update to zero rows", async () => {
    mock.current.tables.profiles = (ops: any[]) => (ops.some((o) => o[0] === "update") ? { data: [] } : { data: rows });
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.change(screen.getAllByPlaceholderText("1499")[0], { target: { value: "999" } });
    fireEvent.click(screen.getAllByTitle("Save custom price")[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Not saved", variant: "destructive" })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Custom price saved" }));
  });

  it("shows no 'No doctors' message while loading, then the plan cards and per-doctor Status", async () => {
    renderPage(true);
    expect(screen.queryByText("No doctors yet.")).not.toBeInTheDocument();
    await screen.findAllByText("Dr Asha");
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    const proCard = screen.getByRole("button", { name: /^Pro:/ });
    expect(proCard).toHaveTextContent("1");
  });

  it("clicking a plan card filters the list, clicking it again clears the filter", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.click(screen.getByRole("button", { name: /^Premium:/ }));
    expect(screen.queryAllByText("Dr Asha")).toHaveLength(0);
    expect(screen.getAllByText("Dr Bala").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Premium:/ }));
    expect(screen.getAllByText("Dr Asha").length).toBeGreaterThan(0);
  });

  it("buckets expired, expiring-soon, trial and suspended doctors from their dates", async () => {
    const day = 86_400_000;
    const iso = (n: number) => new Date(Date.now() + n * day).toISOString();
    mock.current.tables.profiles = { data: [
      ...rows,
      { id: "d3", full_name: "Dr Chet", plan_tier: "pro", plan_status: "active", plan_end: iso(-3), created_at: "2026-09-03T00:00:00Z" },
      { id: "d4", full_name: "Dr Dev", plan_tier: "pro", plan_status: "active", plan_end: iso(4), created_at: "2026-09-04T00:00:00Z" },
      { id: "d5", full_name: "Dr Esha", plan_tier: "free", plan_status: "trial", trial_end: iso(10), created_at: "2026-09-05T00:00:00Z" },
      { id: "d6", full_name: "Dr Fara", plan_tier: "pro", plan_status: "cancelled", plan_end: iso(10), created_at: "2026-09-06T00:00:00Z" },
    ] };
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    // Chet's plan_status still says "active" but the end date passed: counted as expired, not Pro.
    expect(screen.getByRole("button", { name: /^Expired:/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^Expiring soon:/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^Free trial:/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^Suspended:/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^Pro:/ })).toHaveTextContent("2"); // Asha + Dev
    fireEvent.click(screen.getByRole("button", { name: /^Expired:/ }));
    expect(screen.getAllByText("Dr Chet").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Dr Asha")).toHaveLength(0);
  });

  it("extending an expired free-tier doctor extends the trial, not an 'active free' plan", async () => {
    mock.current.tables.profiles = { data: [
      { id: "d9", full_name: "Dr Gita", plan_tier: "free", plan_status: "expired", plan_end: null, trial_end: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    ] };
    renderPage(true);
    await screen.findAllByText("Dr Gita");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2999-05-20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Expiry date updated" })));
    const upd = mock.current.opsOf("profiles").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ trial_end: "2999-05-20T18:29:59.000Z", plan_status: "trial" });
  });

  it("an approved custom plan only changes the price on its base tier", async () => {
    const plan = (base: string) => ({ doctor_id: "d1", request_id: null, base_tier: base, extra_features: [], removed_features: [], monthly_price: 777, valid_from: "2026-01-01T00:00:00Z", valid_until: null, status: "active" });
    mock.current.tables.doctor_custom_plans = { data: [plan("premium")] }; // Asha is on pro
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(screen.queryByText("₹777")).not.toBeInTheDocument();
    expect(screen.getAllByText(/not applied/).length).toBeGreaterThan(0);
  });

  it("has no Free card, and a free-tier doctor with no trial is listed under Expired", async () => {
    mock.current.tables.profiles = { data: [
      ...rows,
      { id: "d7", full_name: "Dr Hari", plan_tier: "free", plan_status: "active", plan_end: null, trial_end: null, created_at: "2026-09-07T00:00:00Z" },
    ] };
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(screen.queryByRole("button", { name: /^Free:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Expired:/ })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: /^Expired:/ }));
    expect(screen.getAllByText("Dr Hari").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Dr Asha")).toHaveLength(0);
  });

  it("Change Tier only offers Pro and Premium (free is listed, disabled, only for a doctor who is on it)", async () => {
    mock.current.tables.profiles = { data: [
      { id: "d8", full_name: "Dr Ila", plan_tier: "free", plan_status: "trial", trial_end: "2999-01-01T00:00:00Z", created_at: "2026-09-08T00:00:00Z" },
    ] };
    renderPage(true);
    await screen.findAllByText("Dr Ila");
    fireEvent.click(screen.getAllByLabelText("Change tier for Dr Ila")[0]);
    expect(await screen.findByRole("option", { name: "pro" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "premium" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "free (trial)" })).toHaveAttribute("aria-disabled", "true");
  });

  it("owner and *.manage holders can use the controls", async () => {
    renderPage(false, { "subscriptions.view": true, "subscriptions.manage": true });
    await screen.findAllByText("Dr Asha");
    for (const b of screen.getAllByTitle("Save custom price")) expect(b).not.toBeDisabled();
  });

  it("labels a seat payment as Doctor seats x N in the self-service payments table", async () => {
    mock.current.tables.plan_upgrade_payments = { data: [
      { id: "u1", doctor_id: "d2", from_tier: "premium", target_tier: "premium", amount: 900, status: "captured", is_mock: false,
        created_at: "2026-11-20T00:00:00Z", kind: "seats", seats_quantity: 3, profiles: { full_name: "Dr Bala", clinic_name: "Bala Care" } },
    ] };
    renderPage(true);
    expect(await screen.findByText("Doctor seats ×3")).toBeInTheDocument();
  });

  it("badges a payment that needs a refund", async () => {
    mock.current.tables.plan_upgrade_payments = { data: [
      { id: "u2", doctor_id: "d2", from_tier: "premium", target_tier: "premium", amount: 900, status: "captured", is_mock: false,
        created_at: "2026-11-20T00:00:00Z", kind: "seats", seats_quantity: 3, needs_refund: true, needs_refund_reason: "plan_lapsed",
        profiles: { full_name: "Dr Bala", clinic_name: "Bala Care" } },
    ] };
    renderPage(true);
    expect(await screen.findByText("Needs refund")).toBeInTheDocument();
  });
});
