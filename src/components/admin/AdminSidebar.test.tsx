import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PERMISSION_MODULES } from "@/lib/staffPermissions";

const m = vi.hoisted(() => ({ useProfile: vi.fn(), signOut: vi.fn() }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: m.useProfile }));
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

  it("logout asks for confirmation, then signs out", async () => {
    m.useProfile.mockReturnValue({ isStaff: false, loading: false, can: () => true });
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));
    expect(m.signOut).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(m.signOut).toHaveBeenCalled());
  });
});
