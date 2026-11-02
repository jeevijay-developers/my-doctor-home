import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SuperAdminSidebar from "./SuperAdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissions } from "@/lib/superadminPermissions";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut } } }));

const ALL = [
  "Overview", "Doctors", "Leads", "Subscriptions", "Plan Requests", "Payments & Payouts",
  "Support Tickets", "Moderation", "Billing", "Feature Flags", "Audit Log", "Notification Testing", "Team",
];

const renderAs = (isOwner: boolean, perms: SAPermissions = {}) =>
  render(
    <MemoryRouter initialEntries={["/superadmin/overview"]}>
      <SuperAdminAccessProvider value={buildSuperAdminAccess(isOwner, perms)}>
        <SidebarProvider>
          <SuperAdminSidebar />
        </SidebarProvider>
      </SuperAdminAccessProvider>
    </MemoryRouter>,
  );

describe("SuperAdminSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({});
  });

  it("owner sees every section including Team", () => {
    renderAs(true);
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    for (const l of ALL) expect(names).toContain(l);
  });

  it("team member sees only sections whose view permission they hold", () => {
    renderAs(false, { "payments.view": true, "doctors.view": true });
    expect(screen.getByRole("link", { name: "Payments & Payouts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doctors" })).toBeInTheDocument();
    for (const l of ["Overview", "Leads", "Subscriptions", "Billing", "Audit Log"]) {
      expect(screen.queryByRole("link", { name: l })).not.toBeInTheDocument();
    }
  });

  it("Team is owner-only, even if a member holds every other permission", () => {
    renderAs(false, {
      "overview.view": true, "doctors.view": true, "leads.view": true, "subscriptions.view": true,
      "plan_requests.view": true, "payments.view": true, "tickets.view": true, "moderation.view": true,
      "billing.view": true, "flags.view": true, "audit.view": true, "notifications.view": true,
    });
    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
  });

  it("a refund/payout flag alone does not reveal the Payments section (needs payments.view)", () => {
    renderAs(false, { "payments.refund": true, "payments.payout": true });
    expect(screen.queryByRole("link", { name: "Payments & Payouts" })).not.toBeInTheDocument();
  });

  it("a member with no permissions sees no section links", () => {
    renderAs(false, {});
    const names = screen.queryAllByRole("link").map((a) => a.textContent);
    for (const l of ALL) expect(names).not.toContain(l);
  });

  it("logout confirms then signs out", async () => {
    renderAs(true);
    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
