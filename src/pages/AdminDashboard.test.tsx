import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";

const useProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useProfile", () => ({
  useProfile: useProfileMock,
  ProfileProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/admin/AdminLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));

const stub = (name: string) => ({ default: () => <div>PAGE:{name}</div> });
vi.mock("@/components/admin/DashboardHome", () => stub("dashboard"));
vi.mock("@/components/admin/MyWebsite", () => stub("my-website"));
vi.mock("@/components/admin/AppointmentsPage", () => stub("appointments"));
vi.mock("@/components/admin/PatientsPage", () => stub("patients"));
vi.mock("@/components/admin/PatientMedicalRecord", () => stub("patient-record"));
vi.mock("@/components/admin/BlogPage", () => stub("blog"));
vi.mock("@/components/admin/BillingPage", () => stub("billing"));
vi.mock("@/components/admin/SettingsPage", () => stub("settings"));
vi.mock("@/components/admin/PrescriptionsPage", () => stub("prescriptions"));
vi.mock("@/components/admin/ReviewsManagePage", () => stub("reviews"));
vi.mock("@/components/admin/InquiriesPage", () => stub("inquiries"));
vi.mock("@/components/admin/StaffManagementPage", () => stub("staff"));
vi.mock("@/components/admin/SupportPage", () => stub("support"));

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminDashboard />
    </MemoryRouter>,
  );

const doctor = { isStaff: false, loading: false, can: () => true };
const staffWith = (...keys: string[]) => ({ isStaff: true, loading: false, can: (k: string) => keys.includes(k) });

const ROUTES: [string, string, string][] = [
  ["/dashboard", "dashboard.view", "dashboard"],
  ["/my-website", "website.view", "my-website"],
  ["/appointments", "appointments.view", "appointments"],
  ["/patients", "patients.view", "patients"],
  ["/patients/abc", "patients.view", "patient-record"],
  ["/blog", "blog.view", "blog"],
  ["/billing", "billing.view", "billing"],
  ["/settings", "profile.view", "settings"],
  ["/prescriptions", "prescriptions.view", "prescriptions"],
  ["/reviews", "reviews.view", "reviews"],
  ["/inquiries", "inquiries.view", "inquiries"],
  ["/staff", "staff.view", "staff"],
];

describe("AdminDashboard route gating", () => {
  beforeEach(() => useProfileMock.mockReset());

  it.each(ROUTES)("doctor can open %s", async (path, _perm, page) => {
    useProfileMock.mockReturnValue(doctor);
    at(path);
    expect(await screen.findByText(`PAGE:${page}`)).toBeInTheDocument();
  });

  it.each(ROUTES)("staff without the permission is blocked on manually typed %s", async (path, _perm, page) => {
    useProfileMock.mockReturnValue(staffWith());
    at(path);
    expect(await screen.findByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText(`PAGE:${page}`)).not.toBeInTheDocument();
  });

  it.each(ROUTES)("staff with exactly %s's permission (%s) gets in", async (path, perm, page) => {
    useProfileMock.mockReturnValue(staffWith(perm));
    at(path);
    expect(await screen.findByText(`PAGE:${page}`)).toBeInTheDocument();
  });

  it("a permission for a different module does not open the route", async () => {
    useProfileMock.mockReturnValue(staffWith("patients.view"));
    at("/billing");
    expect(await screen.findByText("Access Denied")).toBeInTheDocument();
  });

  it("support is open to every staff member (no permission key)", async () => {
    useProfileMock.mockReturnValue(staffWith());
    at("/support");
    expect(await screen.findByText("PAGE:support")).toBeInTheDocument();
  });

  it("unknown paths fall back to the dashboard route (which is itself gated)", async () => {
    useProfileMock.mockReturnValue(staffWith());
    render(
      <MemoryRouter initialEntries={["/admin/nonsense"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Access Denied")).toBeInTheDocument();
  });
});
