import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SASubscriptions from "./SASubscriptions";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissions } from "@/lib/superadminPermissions";
import { createTableMock } from "@/test/tableMock";

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
    plan_end: "2027-01-01T00:00:00Z", trial_end: null, custom_plan_price: null, created_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "d2", full_name: "Dr Bala", clinic_name: "Bala Care", email: "b@x.in", plan_tier: "premium", plan_status: "active",
    plan_end: "2027-01-01T00:00:00Z", trial_end: null, custom_plan_price: 2999, created_at: "2026-09-02T00:00:00Z",
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
    await screen.findByText("Dr Asha");
    expect(screen.getByText("₹1499")).toBeInTheDocument();
    expect(screen.getByText("₹2999")).toBeInTheDocument();
    expect(screen.getAllByText("Custom Pricing").length).toBeGreaterThan(0);
  });

  it("refuses a zero / empty / out-of-range custom price and writes nothing", async () => {
    renderPage(true);
    await screen.findByText("Dr Asha");
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
    await screen.findByText("Dr Asha");
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
    await screen.findByText("Dr Asha");
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pick a future date" })));
  });

  it("sets plan expiry to 23:59:59 IST of the chosen day (18:29:59Z)", async () => {
    renderPage(true);
    await screen.findByText("Dr Asha");
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2999-05-20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Expiry date updated" })));
    const upd = mock.current.opsOf("profiles").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ plan_end: "2999-05-20T18:29:59.000Z" });
  });

  it("view-only team member cannot save a custom price", async () => {
    renderPage(false, { "subscriptions.view": true });
    await screen.findByText("Dr Asha");
    for (const b of screen.getAllByTitle("Save custom price")) expect(b).toBeDisabled();
  });

  it("team member without doctors.delete cannot open bulk doctor deletion", async () => {
    renderPage(false, { "subscriptions.view": true, "subscriptions.manage": true });
    await screen.findByText("Dr Asha");
    fireEvent.click(screen.getByRole("button", { name: "Select items to delete" }));
    fireEvent.click(screen.getByRole("button", { name: /Select all 2/ }));
    expect(screen.getByRole("button", { name: /Delete Selected/ })).toBeDisabled();
  });

  it("shows an error toast, not success, when RLS filtered the custom-price update to zero rows", async () => {
    mock.current.tables.profiles = (ops: any[]) => (ops.some((o) => o[0] === "update") ? { data: [] } : { data: rows });
    renderPage(true);
    await screen.findByText("Dr Asha");
    fireEvent.change(screen.getAllByPlaceholderText("1499")[0], { target: { value: "999" } });
    fireEvent.click(screen.getAllByTitle("Save custom price")[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Not saved", variant: "destructive" })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Custom price saved" }));
  });

  it("owner and *.manage holders can use the controls", async () => {
    renderPage(false, { "subscriptions.view": true, "subscriptions.manage": true });
    await screen.findByText("Dr Asha");
    for (const b of screen.getAllByTitle("Save custom price")) expect(b).not.toBeDisabled();
  });
});
