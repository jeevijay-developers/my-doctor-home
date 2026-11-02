import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import SALeads from "./SALeads";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({ toast: vi.fn(), audit: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: h.audit }));
// Radix Select needs pointer-capture APIs jsdom lacks; a native <select> keeps the same value/onValueChange contract.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

const leads = [
  { id: "l1", name: "Dr Kiran", clinic_name: "Kiran Clinic", city: "Pune", email: "k@x.test", phone: "9876500001", message: "Want a demo", status: null, created_at: "2026-10-01T00:00:00Z" },
  { id: "l2", name: "Dr Lata", clinic_name: null, city: null, email: null, phone: null, message: null, status: "contacted", created_at: "2026-10-02T00:00:00Z" },
  { id: "l3", name: "Dr Mohan", clinic_name: "Mohan Care", city: "Delhi", email: "m@x.test", phone: null, message: null, status: "lost", created_at: "2026-10-03T00:00:00Z" },
];

describe("SALeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.enquiries = { data: leads, error: null };
  });

  const table = () => screen.getByRole("table");

  it("lists leads with placeholders for missing fields and mailto/tel links", async () => {
    render(<SALeads />);
    expect(await within(table()).findByText("Dr Kiran")).toBeInTheDocument();
    expect(within(table()).getByText("Dr Lata")).toBeInTheDocument();
    expect(within(table()).getByRole("link", { name: "k@x.test" })).toHaveAttribute("href", "mailto:k@x.test");
    expect(within(table()).getByRole("link", { name: "9876500001" })).toHaveAttribute("href", "tel:9876500001");
    // newest first
    const q = mock.current.opsOf("enquiries")[0];
    expect(mock.current.hasOp(q, "order", "created_at")).toBe(true);
  });

  it("shows 'No leads.' when there are none", async () => {
    mock.current.tables.enquiries = { data: [], error: null };
    render(<SALeads />);
    expect((await screen.findAllByText("No leads.")).length).toBeGreaterThan(0);
  });

  it("treats a null status as 'new' and filters by status", async () => {
    render(<SALeads />);
    await within(table()).findByText("Dr Kiran");
    const filter = screen.getAllByRole("combobox")[0];
    fireEvent.change(filter, { target: { value: "new" } });
    expect(within(table()).getByText("Dr Kiran")).toBeInTheDocument();
    expect(within(table()).queryByText("Dr Lata")).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "lost" } });
    expect(within(table()).getByText("Dr Mohan")).toBeInTheDocument();
    expect(within(table()).queryByText("Dr Kiran")).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "converted" } });
    expect(within(table()).getByText("No leads.")).toBeInTheDocument();
  });

  it("changing a lead's status updates that row, audits the change, and reloads", async () => {
    render(<SALeads />);
    await within(table()).findByText("Dr Kiran");
    const rowSelect = within(within(table()).getByText("Dr Kiran").closest("tr")!).getByRole("combobox");
    fireEvent.change(rowSelect, { target: { value: "converted" } });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Lead updated" }));
    const upd = mock.current.opsOf("enquiries").find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops).toContainEqual(["update", { status: "converted" }]);
    expect(upd.ops).toContainEqual(["eq", "id", "l1"]);
    expect(h.audit).toHaveBeenCalledWith("update_lead_status", "enquiries", "l1", { from: "new", to: "converted" });
    expect(mock.current.opsOf("enquiries").filter((q: any) => q.ops.some((o: any[]) => o[0] === "select")).length).toBeGreaterThan(1);
  });

  it("a failed update toasts the error and writes no audit entry", async () => {
    mock.current.tables.enquiries = (ops: any[][]) =>
      ops.some((o) => o[0] === "update") ? { data: null, error: { message: "RLS denied" } } : { data: leads, error: null };
    render(<SALeads />);
    await within(table()).findByText("Dr Kiran");
    const rowSelect = within(within(table()).getByText("Dr Kiran").closest("tr")!).getByRole("combobox");
    fireEvent.change(rowSelect, { target: { value: "lost" } });
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Failed", description: "RLS denied", variant: "destructive" })),
    );
    expect(h.audit).not.toHaveBeenCalled();
  });
});
