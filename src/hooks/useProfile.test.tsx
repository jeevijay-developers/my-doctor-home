import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
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
  // The owner's own practitioner row (practitioners.user_id = auth user).
  practitioner?: Record<string, unknown> | null;
  practitionerError?: { message: string };
};

// Every select / eq call is recorded so tests can check what was asked for.
const calls: { table: string; select?: string; eqs: [string, unknown][] }[] = [];

const setup = (userId: string | null, rows: Rows) => {
  calls.length = 0;
  m.getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
  m.from.mockImplementation((table: string) => {
    const rec = { table, select: undefined as string | undefined, eqs: [] as [string, unknown][] };
    calls.push(rec);
    const builder: any = {
      select: (cols: string) => {
        rec.select = cols;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        rec.eqs.push([col, val]);
        return builder;
      },
      maybeSingle: () => {
        const id = rec.eqs[0]?.[1] as string;
        const data =
          table === "profiles"
            ? (rows.profiles?.[id] ?? null)
            : table === "staff_members"
              ? (rows.staff ?? null)
              : table === "practitioners"
                ? (rows.practitioner ?? null)
                : null;
        if (table === "practitioners" && rows.practitionerError) return Promise.resolve({ data: null, error: rows.practitionerError });
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  });
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

  it("an owner gets role 'owner' and their own practitioner id", async () => {
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1" } }, practitioner: { id: "pr-owner" } });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("owner");
    expect(result.current.myPractitionerId).toBe("pr-owner");
    const q = calls.find((c) => c.table === "practitioners");
    expect(q?.eqs).toContainEqual(["user_id", "doc-1"]);
  });

  it("an owner without a practitioner row gets myPractitionerId null", async () => {
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1" } }, practitioner: null });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("owner");
    expect(result.current.myPractitionerId).toBeNull();
  });

  it("a doctor login gets role 'doctor' and the practitioner id from the staff row", async () => {
    setup("staff-d", {
      profiles: { "doc-9": { id: "doc-9" } },
      staff: { doctor_id: "doc-9", staff_name: "Dr Two", status: "active", permissions: { "patients.view": true }, role: "doctor", practitioner_id: "pr-2" },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("doctor");
    expect(result.current.myPractitionerId).toBe("pr-2");
    expect(result.current.isStaff).toBe(true);
    expect(result.current.profile?.id).toBe("doc-9");
    expect(result.current.can("patients.view")).toBe(true);
    expect(result.current.can("billing.manage")).toBe(false);
    const staffQuery = calls.find((c) => c.table === "staff_members");
    expect(staffQuery?.select).toBe("doctor_id, staff_name, permissions, status, role, practitioner_id");
  });

  it("reception staff get role 'staff' and no practitioner id", async () => {
    setup("staff-r", {
      profiles: { "doc-9": { id: "doc-9" } },
      staff: { doctor_id: "doc-9", staff_name: "Rita", status: "active", permissions: {}, role: "staff", practitioner_id: null },
    });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("staff");
    expect(result.current.myPractitionerId).toBeNull();
  });

  it("looks the owner's practitioner up once per session, not on every refetch", async () => {
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1" } }, practitioner: { id: "pr-1" } });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.myPractitionerId).toBe("pr-1");
    expect(calls.filter((c) => c.table === "practitioners")).toHaveLength(1);
  });

  it("reports a failed practitioner lookup instead of swallowing it, and still loads the profile", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    setup("doc-1", { profiles: { "doc-1": { id: "doc-1" } }, practitionerError: { message: "boom" } });
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.id).toBe("doc-1");
    expect(result.current.myPractitionerId).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/practitioner/i), expect.anything());
    err.mockRestore();
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
