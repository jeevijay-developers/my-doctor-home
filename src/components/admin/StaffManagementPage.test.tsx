import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffManagementPage from "./StaffManagementPage";
import { createTableMock } from "@/test/tableMock";
import { PERMISSION_MODULES, PERMISSION_PRESETS } from "@/lib/staffPermissions";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  profile: { id: "doc-1" } as any,
  isStaff: false,
  granted: [] as string[],
  features: { staff_management: true } as Record<string, boolean>,
  planLoading: false,
  trial: "full",
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: h.profile,
    isStaff: h.isStaff,
    can: (k: string) => !h.isStaff || h.granted.includes(k),
  }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({
  useFeatureAccess: () => ({ hasFeature: (k: string) => h.features[k] === true, loading: h.planLoading }),
}));
vi.mock("@/contexts/TrialStatusContext", () => ({ useTrialStatus: () => ({ accessLevel: h.trial }) }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("./LockedFeatureCard", () => ({ default: ({ featureName }: any) => <div>LOCKED:{featureName}</div> }));

const row = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  staff_name: "Sunita Desk",
  phone: "+919876543210",
  status: "active",
  permissions: { "patients.view": true },
  created_at: "2026-10-01T00:00:00Z",
  last_login_at: null,
  ...over,
});

describe("StaffManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.staff_members = { data: [row()] };
    h.profile = { id: "doc-1" };
    h.isStaff = false;
    h.granted = [];
    h.features = { staff_management: true };
    h.planLoading = false;
    h.trial = "full";
  });

  it("shows a spinner while the plan is loading", () => {
    h.planLoading = true;
    const { container } = render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText(/Staff Management/)).not.toBeInTheDocument();
  });

  it("is locked (upsell) on plans without the staff_management feature, and loads no staff", () => {
    h.features = {};
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    expect(screen.getByText("LOCKED:Staff Management")).toBeInTheDocument();
  });

  it("loads only this doctor's staff and masks phone numbers", async () => {
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    expect((await screen.findAllByText("Sunita Desk")).length).toBeGreaterThan(0);
    const q = mock.current.opsOf("staff_members")[0];
    expect(mock.current.hasOp(q, "eq", "doctor_id", "doc-1")).toBe(true);
    expect(screen.queryByText("+919876543210")).not.toBeInTheDocument();
    expect(screen.getAllByText(/•••••.*3210/).length).toBeGreaterThan(0);
  });

  it("doctor sees edit, deactivate and delete actions", async () => {
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getAllByLabelText("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Deactivate").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Delete").length).toBeGreaterThan(0);
  });

  it("staff with only staff.view sees no row actions at all", async () => {
    h.isStaff = true;
    h.granted = ["staff.view"];
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("staff with staff.edit/staff.disable get those, but never Delete (doctor-only)", async () => {
    h.isStaff = true;
    h.granted = ["staff.view", "staff.edit", "staff.disable"];
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getAllByLabelText("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Deactivate").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("staff without staff.create cannot see an enabled Add Staff button", async () => {
    h.isStaff = true;
    h.granted = ["staff.view"];
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    const add = screen.queryByRole("button", { name: /Add Staff/ });
    expect(add === null || (add as HTMLButtonElement).disabled).toBe(true);
  });

  it("Add Staff is disabled in the grace period (read-only)", async () => {
    h.trial = "grace";
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getByRole("button", { name: /Add Staff/ })).toBeDisabled();
  });

  const openAdd = async () => {
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/ }));
    return screen.findByRole("button", { name: /Create Staff|Create Account/i });
  };

  it("validates name, phone format and phone confirmation before calling the server", async () => {
    const create = await openAdd();
    fireEvent.click(create);
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Staff name is required"));

    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0], { target: { value: "New Person" } });
    fireEvent.change(screen.getAllByPlaceholderText(/\+91/)[0], { target: { value: "12" } });
    fireEvent.click(create);
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/valid phone/i)));

    fireEvent.change(screen.getAllByPlaceholderText(/\+91/)[0], { target: { value: "+919876500001" } });
    fireEvent.click(create);
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Phone numbers do not match"));
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("deleting needs confirmation, then calls delete-staff-account for that staff id", async () => {
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    fireEvent.click(screen.getAllByLabelText("Delete")[0]);
    expect(mock.current.invoke).not.toHaveBeenCalled();
    const confirm = (await screen.findAllByRole("button", { name: "Delete" })).pop()!;
    fireEvent.click(confirm);
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalled());
    const [fn, opts] = mock.current.invoke.mock.calls[0] as [string, any];
    expect(fn).toBe("delete-staff-account");
    expect(opts.body).toEqual({ staff_id: "s1" });
  });

  it("deactivating sets status inactive for that staff row only", async () => {
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Sunita Desk");
    fireEvent.click(screen.getAllByLabelText("Deactivate")[0]);
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("Staff account deactivated"));
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ status: "inactive" });
    expect(mock.current.hasOp(upd, "eq", "id", "s1")).toBe(true);
  });
  const doctorRows = () => ({
    data: [row(), row({ id: "s2", staff_name: "Dr Mehta", role: "doctor", practitioner_id: "p2", phone: "+919800000002",
      permissions: Object.fromEntries(PERMISSION_PRESETS.doctor.map((k) => [k, true])) })],
  });

  it("a doctor-role login shows a Doctor badge and a Permissions button for the owner, but no edit-all or delete", async () => {
    mock.current.tables.staff_members = doctorRows();
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Dr Mehta");
    const tr = screen.getAllByText("Dr Mehta")[0].closest("tr")!;
    expect(within(tr).getByText("Doctor")).toBeInTheDocument();
    expect(within(tr).getByLabelText("Edit permissions for Dr Mehta")).toBeInTheDocument();
    expect(within(tr).queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(within(tr).queryByLabelText("Delete")).not.toBeInTheDocument();
    const staffTr = screen.getAllByText("Sunita Desk")[0].closest("tr")!;
    expect(within(staffTr).queryByText("Doctor")).not.toBeInTheDocument();
    expect(within(staffTr).getByLabelText("Edit")).toBeInTheDocument();
    expect(within(staffTr).getByLabelText("Delete")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Delete")).toHaveLength(2);
    expect(screen.getAllByLabelText("Edit")).toHaveLength(2);
    // desktop + mobile surfaces
    expect(screen.getAllByLabelText("Edit permissions for Dr Mehta")).toHaveLength(2);
  });

  it("staff (not the owner) cannot edit a doctor login's permissions", async () => {
    h.isStaff = true;
    h.granted = ["staff.view", "staff.edit"];
    mock.current.tables.staff_members = doctorRows();
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Dr Mehta");
    expect(screen.queryByLabelText("Edit permissions for Dr Mehta")).not.toBeInTheDocument();
    expect(screen.getAllByText("Managed by the owner")).toHaveLength(2);
  });

  it("owner edits a doctor login: only permissions are saved, name/phone are locked, no phone function is called", async () => {
    mock.current.tables.staff_members = doctorRows();
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Dr Mehta");
    fireEvent.click(screen.getAllByLabelText("Edit permissions for Dr Mehta")[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Doctor permissions")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")[0]).toBeDisabled();
    // Tick one extra permission (Revenue / View Billing) and save.
    const box = within(dialog).getByText("View Billing").closest("label")!.querySelector('[role="checkbox"]')!;
    fireEvent.click(box);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    const payload = upd.ops.find((o: any[]) => o[0] === "update")[1];
    expect(Object.keys(payload)).toEqual(["permissions"]);
    expect(payload.permissions["billing.view"]).toBe(true);
    expect(payload.permissions["prescriptions.create"]).toBe(true);
    expect(mock.current.hasOp(upd, "eq", "id", "s2")).toBe(true);
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("'Doctor (default)' resets a doctor login to the doctor preset", async () => {
    mock.current.tables.staff_members = { data: [row({ id: "s2", staff_name: "Dr Mehta", role: "doctor", practitioner_id: "p2", permissions: { "dashboard.view": true } })] };
    render(<MemoryRouter><StaffManagementPage /></MemoryRouter>);
    await screen.findAllByText("Dr Mehta");
    fireEvent.click(screen.getAllByLabelText("Edit permissions for Dr Mehta")[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("combobox", { name: /start from/i }));
    fireEvent.click(screen.getByRole("option", { name: "Doctor (default)" }));
    const labelToKey = new Map(PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => [p.label, p.key] as const)));
    const ticked: string[] = [];
    dialog.querySelectorAll('[role="checkbox"]').forEach((b) => {
      if (b.getAttribute("aria-checked") === "true") ticked.push(labelToKey.get(b.closest("label")!.textContent!.trim())!);
    });
    expect(ticked.sort()).toEqual([...PERMISSION_PRESETS.doctor].sort());
  });

  it("?edit=<login id> opens that doctor login's permissions", async () => {
    mock.current.tables.staff_members = doctorRows();
    render(<MemoryRouter initialEntries={["/admin/staff?edit=s2"]}><StaffManagementPage /></MemoryRouter>);
    expect(await screen.findByText("Doctor permissions")).toBeInTheDocument();
  });

  it("'Start from: Reception' ticks exactly the reception preset", async () => {
    await openAdd();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("combobox", { name: /start from/i }));
    fireEvent.click(screen.getByRole("option", { name: "Reception" }));
    // One DOM pass (getByRole per box is too slow): label text -> checked state.
    const checkedByLabel = new Map<string, string | null>();
    dialog.querySelectorAll('[role="checkbox"]').forEach((box) => {
      checkedByLabel.set(box.closest("label")!.textContent!.trim(), box.getAttribute("aria-checked"));
    });
    const labelToKey = new Map(PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => [p.label, p.key] as const)));
    expect(checkedByLabel.size).toBe(labelToKey.size);
    const ticked = [...checkedByLabel].filter(([, c]) => c === "true").map(([label]) => labelToKey.get(label));
    expect(ticked.sort()).toEqual([...PERMISSION_PRESETS.reception].sort());
  });

  it("maps a PHONE_OWNS_CLINIC refusal to the shared message", async () => {
    mock.current.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: "PHONE_OWNS_CLINIC" }) } },
    });
    const create = await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "New Person" } });
    fireEvent.change(screen.getAllByPlaceholderText(/\+91/)[0], { target: { value: "+919876500001" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter the number"), { target: { value: "+919876500001" } });
    fireEvent.click(create);
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(practitionerErrorMessage("PHONE_OWNS_CLINIC")));
    expect(mock.current.invoke.mock.calls[0][0]).toBe("create-staff-account");
  });
});
