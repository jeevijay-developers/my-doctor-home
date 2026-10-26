import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SAPermissionGate from "./SAPermissionGate";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { ALL_SA_PERMISSION_KEYS, SA_ROUTE_PERMISSIONS } from "@/lib/superadminPermissions";

const renderGate = (access: ReturnType<typeof buildSuperAdminAccess>, permission: Parameters<typeof SAPermissionGate>[0]["permission"]) =>
  render(
    <SuperAdminAccessProvider value={access}>
      <SAPermissionGate permission={permission}>secret page</SAPermissionGate>
    </SuperAdminAccessProvider>,
  );

describe("SAPermissionGate", () => {
  it("lets owners into everything, including owner-only pages", () => {
    renderGate(buildSuperAdminAccess(true, {}), null);
    expect(screen.getByText("secret page")).toBeInTheDocument();
  });

  it("lets a team member in only with the required permission", () => {
    renderGate(buildSuperAdminAccess(false, { "payments.view": true }), "payments.view");
    expect(screen.getByText("secret page")).toBeInTheDocument();
  });

  it("blocks a team member without the permission", () => {
    renderGate(buildSuperAdminAccess(false, { "payments.view": false }), "payments.view");
    expect(screen.queryByText("secret page")).not.toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("keeps owner-only pages (null permission) closed to team members, whatever they hold", () => {
    const everything = Object.fromEntries(ALL_SA_PERMISSION_KEYS.map((k) => [k, true]));
    renderGate(buildSuperAdminAccess(false, everything), null);
    expect(screen.queryByText("secret page")).not.toBeInTheDocument();
  });
});

describe("superadmin permission catalogue", () => {
  it("only references real permission keys in the route map", () => {
    for (const r of SA_ROUTE_PERMISSIONS) {
      if (r.permission) expect(ALL_SA_PERMISSION_KEYS).toContain(r.permission);
    }
  });
});
