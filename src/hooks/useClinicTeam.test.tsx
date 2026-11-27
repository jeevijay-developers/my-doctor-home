import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useClinicTeam } from "./useClinicTeam";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

describe("useClinicTeam", () => {
  it("drops the previous clinic's doctors as soon as the clinic changes", async () => {
    rpc.mockImplementation(async (_fn: string, args: { _doctor_id: string }) =>
      args._doctor_id === "c1" ? { data: [{ id: "a" }] } : new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useClinicTeam(id, true), { initialProps: { id: "c1" } });
    await waitFor(() => expect(result.current).toEqual([{ id: "a" }]));
    rerender({ id: "c2" });
    expect(result.current).toBeNull();
  });
});
