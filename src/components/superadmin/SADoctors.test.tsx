import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SADoctors from "./SADoctors";
import { TooltipProvider } from "@/components/ui/tooltip";
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
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./BulkDeleteDoctorsDialog", () => ({
  default: ({ targets }: { targets: { id: string }[] }) => <div>BULK-DELETE-DIALOG:{targets.map((t) => t.id).join(",")}</div>,
}));

const rows = [
  { id: "d1", full_name: "Dr Asha", clinic_name: "Asha Clinic", city: "Pune", plan_tier: "pro", plan_status: "active", created_at: "2026-09-01T00:00:00Z", slug: "asha" },
  { id: "d2", full_name: "Dr Bala", clinic_name: "Bala Care", city: "Delhi", plan_tier: null, plan_status: "expired", created_at: "2026-09-02T00:00:00Z", slug: null },
];

const renderPage = (isOwner: boolean, perms: SAPermissions = {}) =>
  render(
    <MemoryRouter>
      <SuperAdminAccessProvider value={buildSuperAdminAccess(isOwner, perms)}>
        <TooltipProvider>
          <SADoctors />
        </TooltipProvider>
      </SuperAdminAccessProvider>
    </MemoryRouter>,
  );

const selectAll = async () => {
  await screen.findAllByText("Dr Asha");
  fireEvent.click(screen.getAllByLabelText("Select all doctors")[0]);
};

const nameOrder = () => screen.getAllByRole("link").map((a) => a.textContent).filter((t) => t?.startsWith("Dr "));

describe("SADoctors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.profiles = { data: rows };
    mock.current.tables.doctor_feature_overrides = { data: [] };
    mock.current.tables.pending_plans = { data: [] };
  });

  it("lists doctors with tier (free default) and counts active ones for broadcast", async () => {
    renderPage(true);
    expect((await screen.findAllByText("Dr Asha")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("free").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Broadcast to Active \(1\)/ })).toBeInTheDocument();
  });

  it("filters by search text (name/clinic/city)", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: "delhi" } });
    await waitFor(() => expect(screen.queryAllByText("Dr Asha")).toHaveLength(0));
    expect(screen.getAllByText("Dr Bala").length).toBeGreaterThan(0);
  });

  it("owner can open the bulk delete dialog for the selected doctors", async () => {
    renderPage(true);
    await selectAll();
    const del = screen.getByRole("button", { name: /Delete Selected/ });
    expect(del).toBeEnabled();
    fireEvent.click(del);
    expect(screen.getByText("BULK-DELETE-DIALOG:d2,d1")).toBeInTheDocument();
  });

  it("team member with only doctors.view cannot delete doctors", async () => {
    renderPage(false, { "doctors.view": true });
    await selectAll();
    const del = screen.getByRole("button", { name: /Delete Selected/ });
    expect(del).toBeDisabled();
    fireEvent.click(del);
    expect(screen.queryByText(/BULK-DELETE-DIALOG/)).not.toBeInTheDocument();
  });

  it("team member holding doctors.delete can delete", async () => {
    renderPage(false, { "doctors.view": true, "doctors.delete": true });
    await selectAll();
    expect(screen.getByRole("button", { name: /Delete Selected/ })).toBeEnabled();
  });

  it("shows a loading skeleton instead of 'No doctors found' until data arrives", async () => {
    renderPage(true);
    expect(screen.queryByText("No doctors found.")).not.toBeInTheDocument();
    await screen.findAllByText("Dr Asha");
    expect(screen.queryByText("No doctors found.")).not.toBeInTheDocument();
  });

  it("shows an Active badge for active plans", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("every row has a checkbox and the action bar only appears once something is selected", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Select Dr Bala")[0]);
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByText("1 doctor selected")).toBeInTheDocument();
  });

  it("sorts by name A→Z and Z→A", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    expect(nameOrder().slice(0, 2)).toEqual(["Dr Bala", "Dr Asha"]); // newest joined first
    fireEvent.click(screen.getByLabelText("Sort"));
    fireEvent.click(await screen.findByRole("option", { name: "Name: A → Z" }));
    expect(nameOrder().slice(0, 2)).toEqual(["Dr Asha", "Dr Bala"]);
    fireEvent.click(screen.getByLabelText("Sort"));
    fireEvent.click(await screen.findByRole("option", { name: "Name: Z → A" }));
    expect(nameOrder().slice(0, 2)).toEqual(["Dr Bala", "Dr Asha"]);
  });

  it("filters by a custom joined date range", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.click(screen.getByLabelText("Joined date"));
    fireEvent.click(await screen.findByRole("option", { name: "Custom range…" }));
    fireEvent.change(screen.getByLabelText("Joined from"), { target: { value: "2026-09-02" } });
    expect(screen.queryAllByText("Dr Asha")).toHaveLength(0);
    expect(screen.getAllByText("Dr Bala").length).toBeGreaterThan(0);
  });

  it("bulk suspend updates only non-suspended selected doctors after confirmation", async () => {
    mock.current.tables.profiles = { data: [...rows, { id: "d3", full_name: "Dr Chet", plan_tier: "pro", plan_status: "cancelled", created_at: "2026-09-03T00:00:00Z" }] };
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.click(screen.getAllByLabelText("Select all doctors")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Suspend Selected/ }));
    expect(await screen.findByText("Suspend 2 doctors?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => {
      const upd = mock.current.opsOf("profiles").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
      expect(upd).toBeTruthy();
      expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ plan_status: "cancelled" });
      expect(upd.ops.find((o: any[]) => o[0] === "in")[2].sort()).toEqual(["d1", "d2"]);
    });
  });

  it("team member without doctors.edit cannot suspend", async () => {
    renderPage(false, { "doctors.view": true });
    await selectAll();
    expect(screen.getByRole("button", { name: /Suspend Selected/ })).toBeDisabled();
  });

  it("a single-doctor message requires subject and body, then inserts one notification addressed to that doctor", async () => {
    renderPage(true);
    await screen.findAllByText("Dr Asha");
    fireEvent.click(screen.getAllByLabelText("Message Dr Asha")[0]);
    const send = await screen.findByRole("button", { name: /^Send/ });
    expect(send).toBeDisabled();
    expect(mock.current.opsOf("notifications")).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText("What's this about?"), { target: { value: "Hello" } });
    fireEvent.change(screen.getAllByRole("textbox").pop()!, { target: { value: "Body text" } });
    fireEvent.click(send);
    await waitFor(() => expect(mock.current.opsOf("notifications").length).toBe(1));
    const ins = mock.current.opsOf("notifications")[0].ops.find((o: any[]) => o[0] === "insert");
    expect(ins[1]).toMatchObject({ doctor_id: "d1", recipient_user_id: "d1", source_type: "direct_message", title: "Hello", message: "Body text" });
  });
});
