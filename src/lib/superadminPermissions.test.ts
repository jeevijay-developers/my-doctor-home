import { describe, expect, it } from "vitest";
import {
  ALL_SA_PERMISSION_KEYS,
  SA_PERMISSION_MODULES,
  SA_PERMISSION_PRESETS,
  SA_ROUTE_PERMISSIONS,
} from "./superadminPermissions";

describe("SA_PERMISSION_MODULES / ALL_SA_PERMISSION_KEYS", () => {
  it("flattens every module key exactly once", () => {
    const count = SA_PERMISSION_MODULES.reduce((n, m) => n + m.permissions.length, 0);
    expect(ALL_SA_PERMISSION_KEYS).toHaveLength(count);
    expect(new Set(ALL_SA_PERMISSION_KEYS).size).toBe(count);
  });
  it("keys are prefixed by their module key and have labels", () => {
    for (const m of SA_PERMISSION_MODULES)
      for (const p of m.permissions) {
        expect(p.key.startsWith(`${m.key}.`)).toBe(true);
        expect(p.label.trim()).not.toBe("");
      }
  });
  it("team management has no key on purpose (owner only)", () => {
    expect(ALL_SA_PERMISSION_KEYS.some((k) => k.startsWith("team."))).toBe(false);
  });
});

describe("SA_PERMISSION_PRESETS", () => {
  it("only contain known keys, with no duplicates", () => {
    for (const p of SA_PERMISSION_PRESETS) {
      expect(p.permissions.length).toBeGreaterThan(0);
      expect(new Set(p.permissions).size).toBe(p.permissions.length);
      for (const k of p.permissions) expect(ALL_SA_PERMISSION_KEYS).toContain(k);
    }
  });
  it("labels are unique", () => {
    const labels = SA_PERMISSION_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("no preset hands out the sensitive phi.view or destructive delete keys", () => {
    for (const p of SA_PERMISSION_PRESETS) {
      expect(p.permissions).not.toContain("phi.view");
      expect(p.permissions).not.toContain("doctors.delete");
      expect(p.permissions).not.toContain("tickets.delete");
    }
  });
});

describe("SA_ROUTE_PERMISSIONS", () => {
  it("non-null permissions are real keys; prefixes unique under /superadmin", () => {
    const prefixes = SA_ROUTE_PERMISSIONS.map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const r of SA_ROUTE_PERMISSIONS) {
      expect(r.prefix.startsWith("/superadmin/")).toBe(true);
      if (r.permission !== null) expect(ALL_SA_PERMISSION_KEYS).toContain(r.permission);
    }
  });
  it("only the team route is owner-only (null)", () => {
    expect(SA_ROUTE_PERMISSIONS.filter((r) => r.permission === null).map((r) => r.prefix)).toEqual(["/superadmin/team"]);
  });
  it("every gated route requires a .view permission", () => {
    for (const r of SA_ROUTE_PERMISSIONS) if (r.permission) expect(r.permission.endsWith(".view")).toBe(true);
  });
});
