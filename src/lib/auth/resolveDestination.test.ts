import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isAdmin: false as boolean | null,
  member: null as { status: string } | null,
  staff: null as { status: string; role?: string } | null,
  profile: null as { onboarding_completed: boolean } | null,
  rpcCalls: [] as string[],
  fromCalls: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (name: string) => {
      state.rpcCalls.push(name);
      return { data: name === "has_role" ? state.isAdmin : null, error: null };
    }),
    from: vi.fn((table: string) => {
      state.fromCalls.push(table);
      const result = () => {
        const data =
          table === "superadmin_team_members" ? state.member : table === "staff_members" ? state.staff : state.profile;
        return Promise.resolve({ data, error: null });
      };
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: result, single: result };
      return chain;
    }),
  },
}));

import { resolvePostLoginDestination } from "./resolveDestination";

beforeEach(() => {
  state.isAdmin = false;
  state.member = null;
  state.staff = null;
  state.profile = null;
  state.rpcCalls = [];
  state.fromCalls = [];
});

describe("resolvePostLoginDestination", () => {
  it("owner (has_role admin) goes to /superadmin and short-circuits", async () => {
    state.isAdmin = true;
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/superadmin" });
    expect(state.fromCalls).toEqual([]);
    expect(state.rpcCalls).toEqual(["has_role"]);
  });

  it("active team member goes to /superadmin and records login only on a fresh login", async () => {
    state.member = { status: "active" };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/superadmin" });
    expect(state.rpcCalls).toContain("touch_team_login");

    state.rpcCalls = [];
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/superadmin" });
    expect(state.rpcCalls).not.toContain("touch_team_login");
  });

  it("inactive team member gets an error and no login record", async () => {
    state.member = { status: "disabled" };
    const r = await resolvePostLoginDestination("u", { onboarding: true });
    expect(r).toEqual({ error: expect.stringMatching(/team account is inactive/i) });
    expect(state.rpcCalls).not.toContain("touch_team_login");
  });

  it("team membership takes priority over a staff row", async () => {
    state.member = { status: "active" };
    state.staff = { status: "active" };
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/superadmin" });
    expect(state.fromCalls).not.toContain("staff_members");
  });

  it("active clinic staff goes to /admin/dashboard and records login only on a fresh login", async () => {
    state.staff = { status: "active" };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/admin/dashboard" });
    expect(state.rpcCalls).toContain("touch_staff_login");
    state.rpcCalls = [];
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/admin/dashboard" });
    expect(state.rpcCalls).not.toContain("touch_staff_login");
    // staff never hit the profiles/onboarding check
    expect(state.fromCalls).not.toContain("profiles");
  });

  it("an active doctor login lands on the live queue", async () => {
    state.staff = { status: "active", role: "doctor" };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/admin/appointments?tab=queue" });
    expect(state.rpcCalls).toContain("touch_staff_login");
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/admin/appointments?tab=queue" });
  });

  it("staff with role 'staff' still go to /admin/dashboard", async () => {
    state.staff = { status: "active", role: "staff" };
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/admin/dashboard" });
  });

  it("an inactive doctor login gets the inactive error, not the queue", async () => {
    state.staff = { status: "disabled", role: "doctor" };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({
      error: expect.stringMatching(/staff account is inactive/i),
    });
  });

  it("inactive staff gets an error", async () => {
    state.staff = { status: "inactive" };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({
      error: expect.stringMatching(/staff account is inactive/i),
    });
  });

  it("doctor with unfinished onboarding goes to /onboarding on fresh login", async () => {
    state.profile = { onboarding_completed: false };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/onboarding" });
  });

  it("doctor with no profile row yet goes to /onboarding", async () => {
    state.profile = null;
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/onboarding" });
  });

  it("doctor with completed onboarding goes to /admin/dashboard", async () => {
    state.profile = { onboarding_completed: true };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/admin/dashboard" });
  });

  it("existing-session redirect (onboarding:false) never consults profiles", async () => {
    state.profile = { onboarding_completed: false };
    expect(await resolvePostLoginDestination("u", { onboarding: false })).toEqual({ to: "/admin/dashboard" });
    expect(state.fromCalls).not.toContain("profiles");
  });

  it("a null has_role result is treated as not-admin", async () => {
    state.isAdmin = null;
    state.profile = { onboarding_completed: true };
    expect(await resolvePostLoginDestination("u", { onboarding: true })).toEqual({ to: "/admin/dashboard" });
  });
});
