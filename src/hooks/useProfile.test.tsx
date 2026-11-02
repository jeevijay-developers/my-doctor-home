import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfile } from "./useProfile";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: m.getUser }, from: m.from, channel: m.channel, removeChannel: m.removeChannel },
}));

type Rows = {
  profiles?: Record<string, unknown>;
  staff?: Record<string, unknown> | null;
};

const setup = (userId: string | null, rows: Rows) => {
  m.getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
  m.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (_col: string, id: string) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: table === "profiles" ? (rows.profiles?.[id] ?? null) : table === "staff_members" ? rows.staff ?? null : null,
          }),
      }),
    }),
  }));
  const ch: any = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
  m.channel.mockReturnValue(ch);
};

describe("useProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a doctor to their own profile, can() always true", async () => {
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1", full_name: "Dr A" } } });
    const { result } = renderHook(() => useProfile());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.id).toBe("doc-1");
    expect(result.current.isStaff).toBe(false);
    expect(result.current.can("billing.manage")).toBe(true);
    expect(result.current.authUserId).toBe("doc-1");
  });

  it("resolves active staff to the ASSIGNED DOCTOR's profile but keeps authUserId as the staff id", async () => {
    setup("staff-1", {
      profiles: { "doc-9": { id: "doc-9", full_name: "Dr Nine" } },
      staff: { doctor_id: "doc-9", staff_name: "Sam", status: "active", permissions: { "patients.view": true, "billing.manage": false } },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isStaff).toBe(true);
    expect(result.current.profile?.id).toBe("doc-9");
    expect(result.current.authUserId).toBe("staff-1");
    expect(result.current.staffName).toBe("Sam");
    expect(result.current.can("patients.view")).toBe(true);
    expect(result.current.can("billing.manage")).toBe(false);
    expect(result.current.can("staff.create")).toBe(false);
  });

  it("falls back to an id-only stub when staff cannot read the doctor profile (no View Profile)", async () => {
    setup("staff-1", {
      profiles: {},
      staff: { doctor_id: "doc-9", staff_name: "Sam", status: "active", permissions: {} },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual({ id: "doc-9" });
  });

  it("gives an inactive staff member no profile and no staff identity", async () => {
    setup("staff-2", {
      staff: { doctor_id: "doc-9", staff_name: "Ex", status: "disabled", permissions: { "patients.view": true } },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.staffName).toBeNull();
    expect(result.current.staffPermissions).toEqual({});
  });

  it("a disabled staff member must not pass can() checks", async () => {
    setup("staff-2", {
      staff: { doctor_id: "doc-9", staff_name: "Ex", status: "disabled", permissions: {} },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("billing.manage")).toBe(false);
  });

  it("signed-out user: loading ends, no profile", async () => {
    setup(null, {});
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.authUserId).toBeNull();
  });

  it("subscribes to realtime for the resolved profile id and cleans up", async () => {
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1" } } });
    const { unmount } = renderHook(() => useProfile());
    await waitFor(() => expect(m.channel).toHaveBeenCalled());
    expect(m.channel.mock.calls[0][0]).toContain("profile-live-doc-1");
    unmount();
    expect(m.removeChannel).toHaveBeenCalled();
  });
});
