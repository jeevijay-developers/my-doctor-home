import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import DashboardHome from "./DashboardHome";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  profile: null as any,
  isStaff: false,
  can: ((_k: string) => true) as (k: string) => boolean,
  role: undefined as string | undefined,
  staffName: null as string | null,
  myPractitionerId: null as string | null,
  isMulti: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, isStaff: h.isStaff, can: h.can, role: h.role, staffName: h.staffName, myPractitionerId: h.myPractitionerId }),
}));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({ isMulti: h.isMulti, byId: (id: string) => (id === "pr-2" ? { id, display_name: "Dr. Meera" } : undefined) }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ nearCap: false, appointmentsUsed: 0, appointmentsCap: 30 }),
}));
vi.mock("./PlanCard", () => ({ default: () => <div>PLAN-CARD</div> }));
vi.mock("./UpgradeCheckoutDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const today = () => format(new Date(), "yyyy-MM-dd");

const seed = () => {
  const t = mock.current.tables;
  t.appointments = (ops: any[]) => {
    const head = ops.find((o) => o[0] === "select")?.[2]?.head;
    if (head) return { data: null, count: 12 };
    return {
      data: [
        { id: "a1", patient_name: "Ravi Kumar", time_slot: "10:00", status: "confirmed", date: today(), appointment_type: "clinic", service_name: "Consult" },
        { id: "a2", patient_name: "Sita Devi", time_slot: "11:00", status: "completed", date: today(), appointment_type: "clinic", service_name: "Consult" },
        { id: "a3", patient_name: "Mohan Lal", time_slot: "12:00", status: "cancelled", date: today(), appointment_type: "clinic", service_name: "Consult" },
        { id: "a4", patient_name: "Geeta Rao", time_slot: "13:00", status: "pending", date: today(), appointment_type: "clinic", service_name: "Consult" },
      ],
    };
  };
  t.patients = { data: null, count: 7 };
  t.invoices = { data: [{ amount: 1000, created_at: new Date().toISOString() }, { amount: "500", created_at: new Date().toISOString() }, { amount: null, created_at: new Date().toISOString() }] };
  t.reviews = { data: [{ rating: 5 }, { rating: 4 }] };
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

describe("DashboardHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.profile = { id: "doc-1", full_name: "Asha Rao", slug: "asha", plan_status: "active", plan_tier: "pro", trial_end: null };
    h.isStaff = false;
    h.can = () => true;
    h.role = undefined; h.staffName = null; h.myPractitionerId = null; h.isMulti = false;
    mock.current = createTableMock();
    seed();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("greets the doctor by first name", async () => {
    renderPage();
    expect(await screen.findByText(/Welcome back, Asha/)).toBeInTheDocument();
  });

  it("every dashboard query is scoped to this doctor", async () => {
    renderPage();
    await screen.findByLabelText(/Appointments: 12/);
    for (const q of mock.current.queries) {
      expect(mock.current.hasOp(q, "eq", "doctor_id", "doc-1")).toBe(true);
    }
  });

  it("shows counts and sums revenue from invoices in en-IN format (null/strings tolerated)", async () => {
    renderPage();
    expect(await screen.findByLabelText("Appointments: 12, 4 today")).toBeInTheDocument();
    expect(screen.getByLabelText("Patients: 7, All time")).toBeInTheDocument();
    expect(screen.getByLabelText("Revenue: ₹1,500, Paid appointments")).toBeInTheDocument();
    expect(screen.getByLabelText("Reviews: 4.5, 2 reviews")).toBeInTheDocument();
  });

  it("counts only real patients (excludes provisional zero-visit ones)", async () => {
    renderPage();
    await screen.findByLabelText(/Patients: 7/);
    const q = mock.current.opsOf("patients")[0];
    expect(q.ops.find((o: any[]) => o[0] === "or")[1]).toBe("auto_created.eq.false,total_visits.gt.0");
  });

  it("today's schedule lists only outstanding (pending/confirmed) appointments", async () => {
    renderPage();
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("Geeta Rao")).toBeInTheDocument();
    expect(screen.queryByText("Sita Devi")).not.toBeInTheDocument();
    expect(screen.queryByText("Mohan Lal")).not.toBeInTheDocument();
  });

  it("shows 'No reviews yet' with no reviews", async () => {
    mock.current.tables.reviews = { data: [] };
    renderPage();
    expect(await screen.findByLabelText("Reviews: —, No reviews yet")).toBeInTheDocument();
  });

  it("doctors see the plan card; staff do not", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText("PLAN-CARD")).toBeInTheDocument();
    unmount();
    h.isStaff = true;
    renderPage();
    await screen.findByText(/Welcome back/);
    expect(screen.queryByText("PLAN-CARD")).not.toBeInTheDocument();
  });

  describe("trial banners", () => {
    const trialProfile = (hoursLeft: number) => ({
      id: "doc-1", full_name: "Asha Rao", slug: "asha", plan_status: "trial", plan_tier: "pro",
      trial_end: new Date(Date.now() + hoursLeft * 3600_000).toISOString(),
    });

    it("shows the urgent banner only in the final 24 hours, and can be dismissed for the session", async () => {
      h.profile = trialProfile(10);
      renderPage();
      const dismiss = await screen.findByLabelText("Dismiss");
      fireEvent.click(dismiss);
      expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument();
      expect(sessionStorage.getItem("trial-ending-banner-dismissed-doc-1")).toBe("1");
    });

    it("no urgent banner with several days left", async () => {
      h.profile = trialProfile(24 * 5);
      renderPage();
      await screen.findByText(/Welcome back/);
      expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument();
    });

    it("no urgent banner for staff", async () => {
      h.profile = trialProfile(5);
      h.isStaff = true;
      renderPage();
      await screen.findByText(/Welcome back/);
      expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument();
    });

    it("an already dismissed banner stays hidden", async () => {
      h.profile = trialProfile(5);
      sessionStorage.setItem("trial-ending-banner-dismissed-doc-1", "1");
      renderPage();
      await screen.findByText(/Welcome back/);
      await waitFor(() => expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument());
    });
  });

  it("hides revenue figures from staff without billing.view", async () => {
    h.isStaff = true;
    h.can = (k: string) => k === "dashboard.view";
    renderPage();
    await screen.findByText(/Welcome back/);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText(/^Revenue:/)).not.toBeInTheDocument();
  });

  describe("doctor login in a multi-doctor clinic", () => {
    beforeEach(() => {
      h.isStaff = true; h.role = "doctor"; h.staffName = "Dr. Meera"; h.myPractitionerId = "pr-2"; h.isMulti = true;
      h.can = (k) => k !== "billing.view" && k !== "appointments.all_doctors";
    });

    it("greets by their own name, not the owner's, and shares under it", async () => {
      renderPage();
      expect(await screen.findByText(/Welcome back, Dr\. Meera/)).toBeInTheDocument();
      expect(screen.queryByText(/Asha/)).not.toBeInTheDocument();
      const box = (await screen.findByDisplayValue(/Book your appointment online with/)) as HTMLTextAreaElement;
      expect(box.value).toContain("Dr. Meera");
      expect(box.value).not.toContain("Asha");
    });

    it("scopes appointment queries to their practitioner and hides revenue", async () => {
      renderPage();
      await screen.findByText(/Welcome back/);
      await waitFor(() => expect(mock.current.opsOf("appointments").length).toBe(3));
      for (const q of mock.current.opsOf("appointments")) {
        expect(mock.current.hasOp(q, "eq", "practitioner_id", "pr-2")).toBe(true);
      }
      expect(screen.queryByLabelText(/^Revenue/)).not.toBeInTheDocument();
      expect(mock.current.opsOf("invoices").length).toBe(0);
    });

    it("with appointments.all_doctors the queries are not narrowed", async () => {
      h.can = (k) => k !== "billing.view";
      renderPage();
      await screen.findByLabelText(/Appointments: 12/);
      for (const q of mock.current.opsOf("appointments")) {
        expect(mock.current.hasOp(q, "eq", "practitioner_id", "pr-2")).toBe(false);
      }
    });
  });
});
