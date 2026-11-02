import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "admin-1" } as { id: string } | null,
  inserts: [] as { table: string; row: any }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (row: any) => {
        h.inserts.push({ table, row });
        return { error: null };
      }),
    })),
  },
}));

import { logAdminAction } from "./adminAudit";

beforeEach(() => {
  h.user = { id: "admin-1" };
  h.inserts = [];
});

describe("logAdminAction", () => {
  it("inserts a full audit row", async () => {
    await logAdminAction("delete_doctor", "profiles", "p1", { reason: "spam" });
    expect(h.inserts).toEqual([
      {
        table: "admin_audit_log",
        row: { admin_user_id: "admin-1", action: "delete_doctor", target_table: "profiles", target_id: "p1", details: { reason: "spam" } },
      },
    ]);
  });
  it("stores nulls for omitted optional args", async () => {
    await logAdminAction("login");
    expect(h.inserts[0].row).toEqual({ admin_user_id: "admin-1", action: "login", target_table: null, target_id: null, details: null });
  });
  it("preserves explicit empty-string target values (only undefined becomes null)", async () => {
    await logAdminAction("x", "", "");
    expect(h.inserts[0].row.target_table).toBe("");
    expect(h.inserts[0].row.target_id).toBe("");
  });
  it("does nothing when nobody is signed in", async () => {
    h.user = null;
    await logAdminAction("anything", "t", "id");
    expect(h.inserts).toHaveLength(0);
  });
});
