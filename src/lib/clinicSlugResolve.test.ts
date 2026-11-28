import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTableMock } from "@/test/tableMock";
import { resolveClinicSlug, resolveSlugRedirect } from "./clinicSlugResolve";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));

describe("clinic slug resolver", () => {
  beforeEach(() => { mock.current = createTableMock(); });

  it("returns the current slug from resolve_clinic_slug", async () => {
    mock.current.rpcs.resolve_clinic_slug = (a: any) => (a._slug === "old" ? "new" : null);
    expect(await resolveClinicSlug("old")).toBe("new");
    expect(await resolveClinicSlug("zzz")).toBeNull();
  });
  it("is null on RPC error or throw", async () => {
    mock.current.rpcs.resolve_clinic_slug = () => ({ data: null, error: { message: "x" } });
    expect(await resolveClinicSlug("old")).toBeNull();
    mock.current.rpcs.resolve_clinic_slug = () => { throw new Error("down"); };
    expect(await resolveClinicSlug("old")).toBeNull();
  });
  it("builds the redirect target with suffix and query, and none when current or unknown", async () => {
    mock.current.rpcs.resolve_clinic_slug = (a: any) => (a._slug === "old" ? "new" : a._slug === "cur" ? "cur" : null);
    expect(await resolveSlugRedirect("old", { pathname: "/dr/old/manage", search: "?t=1" })).toBe("/dr/new/manage?t=1");
    expect(await resolveSlugRedirect("cur", { pathname: "/dr/cur/manage" })).toBeNull();
    expect(await resolveSlugRedirect("nope", { pathname: "/dr/nope/manage" })).toBeNull();
  });
});
