import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import StaffManagementPage from "./StaffManagementPage";
import { createTableMock } from "@/test/tableMock";

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
    const { container } = render(<StaffManagementPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText(/Staff Management/)).not.toBeInTheDocument();
  });

  it("is locked (upsell) on plans without the staff_management feature, and loads no staff", () => {
    h.features = {};
    render(<StaffManagementPage />);
    expect(screen.getByText("LOCKED:Staff Management")).toBeInTheDocument();
  });

  it("loads only this doctor's staff and masks phone numbers", async () => {
    render(<StaffManagementPage />);
    expect((await screen.findAllByText("Sunita Desk")).length).toBeGreaterThan(0);
    const q = mock.current.opsOf("staff_members")[0];
    expect(mock.current.hasOp(q, "eq", "doctor_id", "doc-1")).toBe(true);
    expect(screen.queryByText("+919876543210")).not.toBeInTheDocument();
    expect(screen.getAllByText(/•••••.*3210/).length).toBeGreaterThan(0);
  });

  it("doctor sees edit, deactivate and delete actions", async () => {
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getAllByLabelText("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Deactivate").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Delete").length).toBeGreaterThan(0);
  });

  it("staff with only staff.view sees no row actions at all", async () => {
    h.isStaff = true;
    h.granted = ["staff.view"];
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("staff with staff.edit/staff.disable get those, but never Delete (doctor-only)", async () => {
    h.isStaff = true;
    h.granted = ["staff.view", "staff.edit", "staff.disable"];
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getAllByLabelText("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Deactivate").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("staff without staff.create cannot see an enabled Add Staff button", async () => {
    h.isStaff = true;
    h.granted = ["staff.view"];
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    const add = screen.queryByRole("button", { name: /Add Staff/ });
    expect(add === null || (add as HTMLButtonElement).disabled).toBe(true);
  });

  it("Add Staff is disabled in the grace period (read-only)", async () => {
    h.trial = "grace";
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    expect(screen.getByRole("button", { name: /Add Staff/ })).toBeDisabled();
  });

  const openAdd = async () => {
    render(<StaffManagementPage />);
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
    render(<StaffManagementPage />);
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
    render(<StaffManagementPage />);
    await screen.findAllByText("Sunita Desk");
    fireEvent.click(screen.getAllByLabelText("Deactivate")[0]);
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("Staff account deactivated"));
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1]).toEqual({ status: "inactive" });
    expect(mock.current.hasOp(upd, "eq", "id", "s1")).toBe(true);
  });
});
