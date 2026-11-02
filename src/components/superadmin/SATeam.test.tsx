import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SATeam from "./SATeam";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

const member = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "Priya Support",
  phone: "+919876543210",
  status: "active",
  permissions: { "tickets.view": true, "tickets.reply": true },
  created_at: "2026-10-01T00:00:00Z",
  last_login_at: null,
  ...over,
});

describe("SATeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.superadmin_team_members = { data: [member()] };
    mock.current.tables.user_roles = { data: [] };
  });

  it("lists members, masks the phone number and counts granted permissions", async () => {
    render(<SATeam />);
    expect((await screen.findAllByText("Priya Support")).length).toBeGreaterThan(0);
    expect(screen.queryByText("+919876543210")).not.toBeInTheDocument();
    expect(screen.getAllByText(/•••••.*3210/).length).toBeGreaterThan(0);
  });

  it("shows the empty state", async () => {
    mock.current.tables.superadmin_team_members = { data: [] };
    render(<SATeam />);
    expect(await screen.findByText("No team members yet")).toBeInTheDocument();
  });

  const openAdd = async () => {
    render(<SATeam />);
    await screen.findAllByText("Priya Support");
    fireEvent.click(screen.getByRole("button", { name: /Add Team Member/ }));
    return screen.findByRole("button", { name: "Create Team Member" });
  };

  it("requires a name before creating", async () => {
    const create = await openAdd();
    fireEvent.click(create);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Name is required"));
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone number", async () => {
    const create = await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Sam" } });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), { target: { value: "123" } });
    fireEvent.click(create);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/valid phone/i)));
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("rejects mismatched phone confirmation", async () => {
    const create = await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Sam" } });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), { target: { value: "+919876500001" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter the number"), { target: { value: "+919876500002" } });
    fireEvent.click(create);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Phone numbers do not match"));
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("creates a member with only the checked permissions (preset applied)", async () => {
    const create = await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Sam" } });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), { target: { value: "+919876500001" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter the number"), { target: { value: "+919876500001" } });
    fireEvent.click(screen.getByRole("button", { name: "Content Moderator" }));
    fireEvent.click(create);
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalled());
    const [fn, opts] = mock.current.invoke.mock.calls[0] as [string, any];
    expect(fn).toBe("create-team-member");
    expect(opts.body.name).toBe("Sam");
    expect(opts.body.phone).toBe("+919876500001");
    expect(opts.body.permissions).toEqual({ "moderation.view": true, "moderation.manage": true });
    // never grants payment powers by default
    expect(opts.body.permissions["payments.refund"]).toBeUndefined();
  });

  it("deleting requires confirmation and calls delete-team-member for that member", async () => {
    render(<SATeam />);
    await screen.findAllByText("Priya Support");
    fireEvent.click(screen.getAllByLabelText("Delete")[0]);
    expect(mock.current.invoke).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalled());
    const [fn, opts] = mock.current.invoke.mock.calls[0] as [string, any];
    expect(fn).toBe("delete-team-member");
    expect(opts.body).toEqual({ member_id: "m1" });
  });

  it("deactivating an active member updates only status", async () => {
    render(<SATeam />);
    await screen.findAllByText("Priya Support");
    fireEvent.click(screen.getAllByLabelText("Deactivate")[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Team member deactivated"));
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ status: "inactive" });
    expect(upd.ops.some((o: any[]) => o[0] === "eq" && o[1] === "id" && o[2] === "m1")).toBe(true);
  });
});
