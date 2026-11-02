// Guards the hand-maintained client/Deno duplicates of the permission key lists.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSION_MODULES } from "./staffPermissions";
import { ALL_SA_PERMISSION_KEYS } from "./superadminPermissions";

const sharedDir = path.resolve(__dirname, "../../supabase/functions/_shared");

function keysFromEdgeArray(file: string, constName: string): string[] {
  const src = readFileSync(path.join(sharedDir, file), "utf8");
  const m = src.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`));
  if (!m) throw new Error(`could not find ${constName} in ${file}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function keysFromUnion(file: string, typeName: string): string[] {
  const src = readFileSync(path.resolve(__dirname, file), "utf8");
  const union = src.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`))![1];
  return [...union.matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((x) => x[1]);
}

describe("staff permission key parity (src vs edge _shared)", () => {
  const edge = keysFromEdgeArray("staffPermissions.ts", "STAFF_PERMISSION_KEYS");
  const client = PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));

  it("edge list is non-empty and duplicate-free", () => {
    expect(edge.length).toBeGreaterThan(0);
    expect(new Set(edge).size).toBe(edge.length);
  });
  it("key sets are identical", () => {
    expect([...client].sort()).toEqual([...edge].sort());
  });
  it("PermissionKey union in src lists the same keys", () => {
    expect(keysFromUnion("staffPermissions.ts", "PermissionKey").sort()).toEqual([...client].sort());
  });
});

describe("superadmin permission key parity (src vs edge _shared)", () => {
  const edge = keysFromEdgeArray("superadminPermissions.ts", "SA_PERMISSION_KEYS");

  it("edge list is non-empty and duplicate-free", () => {
    expect(edge.length).toBeGreaterThan(0);
    expect(new Set(edge).size).toBe(edge.length);
  });
  it("key sets are identical", () => {
    expect([...ALL_SA_PERMISSION_KEYS].sort()).toEqual([...edge].sort());
  });
  it("SAPermissionKey union in src lists the same keys", () => {
    expect(keysFromUnion("superadminPermissions.ts", "SAPermissionKey").sort()).toEqual([...ALL_SA_PERMISSION_KEYS].sort());
  });
});
