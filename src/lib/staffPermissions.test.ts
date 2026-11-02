import { describe, expect, it } from "vitest";
import { PERMISSION_MODULES, ROUTE_PERMISSIONS, permissionForPath, type PermissionKey } from "./staffPermissions";

const ALL_KEYS = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));

describe("PERMISSION_MODULES", () => {
  it("has unique keys, each prefixed by its module key", () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length);
    for (const m of PERMISSION_MODULES) {
      for (const p of m.permissions) {
        expect(p.key.startsWith(`${m.key}.`)).toBe(true);
        expect(p.label.trim()).not.toBe("");
      }
    }
  });
  it("module keys are unique", () => {
    const keys = PERMISSION_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("ROUTE_PERMISSIONS", () => {
  it("only references real permission keys", () => {
    for (const r of ROUTE_PERMISSIONS) expect(ALL_KEYS).toContain(r.permission);
  });
  it("prefixes are unique, under /admin and have no trailing slash", () => {
    const prefixes = ROUTE_PERMISSIONS.map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) {
      expect(p.startsWith("/admin/")).toBe(true);
      expect(p.endsWith("/")).toBe(false);
    }
  });
  it("every route is gated on a .view permission (entering a page needs only view)", () => {
    for (const r of ROUTE_PERMISSIONS) expect(r.permission.endsWith(".view")).toBe(true);
  });
});

describe("permissionForPath", () => {
  it.each(ROUTE_PERMISSIONS.map((r) => [r.prefix, r.permission] as [string, PermissionKey]))("%s -> %s", (prefix, perm) => {
    expect(permissionForPath(prefix)).toBe(perm);
    expect(permissionForPath(`${prefix}/`)).toBe(perm);
    expect(permissionForPath(`${prefix}/some-id`)).toBe(perm);
    expect(permissionForPath(`${prefix}/a/b/c`)).toBe(perm);
  });

  it("does not match sibling paths that merely share a prefix string", () => {
    expect(permissionForPath("/admin/patientsX")).toBeNull();
    expect(permissionForPath("/admin/patients-archive")).toBeNull();
    expect(permissionForPath("/admin/billingx/1")).toBeNull();
    expect(permissionForPath("/admin/staffing")).toBeNull();
  });

  it("returns null for ungated routes", () => {
    expect(permissionForPath("/admin/support")).toBeNull();
    expect(permissionForPath("/admin/profile")).toBeNull();
    expect(permissionForPath("/admin")).toBeNull();
    expect(permissionForPath("/admin/")).toBeNull();
    expect(permissionForPath("/")).toBeNull();
    expect(permissionForPath("")).toBeNull();
  });

  it("resolves nested ids", () => {
    expect(permissionForPath("/admin/patients/6f1c2b7e-0000-0000-0000-000000000000")).toBe("patients.view");
  });

  it("is case-sensitive and anchored at the start", () => {
    expect(permissionForPath("/Admin/patients")).toBeNull();
    expect(permissionForPath("/x/admin/patients")).toBeNull();
    expect(permissionForPath("admin/patients")).toBeNull();
  });

  it("settings is gated on profile.view", () => {
    expect(permissionForPath("/admin/settings")).toBe("profile.view");
  });
});
