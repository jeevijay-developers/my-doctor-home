import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PERMISSION_MODULES } from "@/lib/staffPermissions";

const m = vi.hoisted(() => ({ useProfile: vi.fn(), signOut: vi.fn(), access: null as null | { has_feature: boolean }, isMulti: false }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: m.useProfile }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ access: m.access, isMulti: m.isMulti }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: m.signOut } } }));

const ALL_LINKS = [
  "Dashboard", "My Website", "Appointments", "Patients", "Prescriptions", "Reviews",
  "Inquiries", "Blog", "Revenue", "Staff Management", "Settings",
];

const renderSidebar = () =>
  render(
    <MemoryRouter initialEntries={["/admin/dashboard"]}>
      <SidebarProvider>
        <AdminSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );

const staff = (granted: string[]) => ({
  isStaff: true,
  loading: false,
  can: (k: string) => granted.includes(k),
});

describe("AdminSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.signOut.mockResolvedValue({});
    m.access = null;
    m.isMulti = false;
  });

  it("shows every section to the doctor", () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: false, can: () => true });
    renderSidebar();
    for (const l of ALL_LINKS) expect(screen.getByRole("link", { name: l })).toBeInTheDocument();
  });

  it("shows no section links while the profile is loading (no flash of ungranted links)", () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: true, can: () => true });
    renderSidebar();
    for (const l of ALL_LINKS) expect(screen.queryByRole("link", { name: l })).not.toBeInTheDocument();
  });

  it("shows staff only the sections they were granted", () => {
    m.useProfile.mockReturnValue(staff(["patients.view", "appointments.view"]));
    renderSidebar();
    expect(screen.getByRole("link", { name: "Patients" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Appointments" })).toBeInTheDocument();
    for (const l of ["Dashboard", "Revenue", "Staff Management", "Settings", "Blog"]) {
      expect(screen.queryByRole("link", { name: l })).not.toBeInTheDocument();
    }
  });

  it("Settings follows profile.view for staff", () => {
    m.useProfile.mockReturnValue(staff(["profile.view"]));
    renderSidebar();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("staff with no permissions see no section links but still get Contact Support", () => {
    m.useProfile.mockReturnValue(staff([]));
    renderSidebar();
    for (const l of ALL_LINKS) expect(screen.queryByRole("link", { name: l })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contact Support/ })).toHaveAttribute("href", "/admin/support");
  });

  it("every sidebar permission is a real staff permission key", () => {
    const real = new Set(PERMISSION_MODULES.flatMap((mod) => mod.permissions.map((p) => p.key)));
    m.useProfile.mockReturnValue({ isStaff: true, loading: false, can: (k: string) => (real.has(k as never) ? false : true) });
    renderSidebar();
    // If any item used a key outside the catalogue, the stub would grant it and the link would appear.
    for (const l of ALL_LINKS) expect(screen.queryByRole("link", { name: l })).not.toBeInTheDocument();
  });

  it("shows Doctors only when the plan includes multiple doctors", () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: false, can: () => true });
    const { unmount } = renderSidebar();
    expect(screen.queryByRole("link", { name: "Doctors" })).not.toBeInTheDocument();
    unmount();
    m.access = { has_feature: true };
    renderSidebar();
    expect(screen.getByRole("link", { name: "Doctors" })).toHaveAttribute("href", "/admin/doctors");
  });

  it("shows Doctors for a clinic with 2+ active doctors even when the plan lapsed or access is unknown", () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: false, can: () => true });
    m.isMulti = true;
    m.access = { has_feature: false };
    const { unmount } = renderSidebar();
    expect(screen.getByRole("link", { name: "Doctors" })).toBeInTheDocument();
    unmount();
    m.access = null;
    renderSidebar();
    expect(screen.getByRole("link", { name: "Doctors" })).toBeInTheDocument();
  });

  it("Doctors follows practitioners.view for staff", () => {
    m.access = { has_feature: true };
    m.useProfile.mockReturnValue(staff(["practitioners.view"]));
    const { unmount } = renderSidebar();
    expect(screen.getByRole("link", { name: "Doctors" })).toBeInTheDocument();
    unmount();
    m.useProfile.mockReturnValue(staff(["patients.view"]));
    renderSidebar();
    expect(screen.queryByRole("link", { name: "Doctors" })).not.toBeInTheDocument();
  });

  it("logout asks for confirmation, then signs out", async () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: false, can: () => true });
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));
    expect(m.signOut).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(m.signOut).toHaveBeenCalled());
  });
});
