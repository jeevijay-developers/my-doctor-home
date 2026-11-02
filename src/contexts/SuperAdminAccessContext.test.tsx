import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { buildSuperAdminAccess, useSuperAdminAccess } from "./SuperAdminAccessContext";

describe("SuperAdminAccessContext", () => {
  it("defaults to no access when no provider is mounted", () => {
    const { result } = renderHook(() => useSuperAdminAccess());
    expect(result.current.isOwner).toBe(false);
    expect(result.current.can("payments.view")).toBe(false);
  });

  it("owner can do everything", () => {
    const a = buildSuperAdminAccess(true, {});
    expect(a.can("payments.view")).toBe(true);
  });

  it("team member can only do keys that are strictly true", () => {
    const a = buildSuperAdminAccess(false, { "payments.view": true, "payments.refund": false } as any);
    expect(a.can("payments.view")).toBe(true);
    expect(a.can("payments.refund" as any)).toBe(false);
    expect(a.can("doctors.delete" as any)).toBe(false);
  });
});
