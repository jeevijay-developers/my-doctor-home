import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePatientImportAccess } from "./usePatientImportAccess";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));

const ACCESS = { eligible: true, reason: "ok", cap: 2000, patient_count: 40, remaining: 1960 };

const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

describe("usePatientImportAccess", () => {
  beforeEach(() => {
    mock.current = createTableMock();
    mock.current.rpcs.get_patient_import_access = () => ACCESS;
  });

  it("does nothing until it is enabled", () => {
    renderHook(() => usePatientImportAccess(false));
    expect(mock.current.rpc).not.toHaveBeenCalled();
  });

  it("loads the access summary once enabled", async () => {
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.access).toEqual(ACCESS));
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(mock.current.rpc).toHaveBeenCalledWith("get_patient_import_access");
  });

  it("forgets the last answer when disabled, so a reopened dialog starts from checking", async () => {
    const { result, rerender } = renderHook(({ on }) => usePatientImportAccess(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.access).toEqual(ACCESS));
    rerender({ on: false });
    expect(result.current.access).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it("flags a failed lookup instead of guessing an answer", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.access).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("flags a thrown call and an empty answer as failed", async () => {
    mock.current.rpcs.get_patient_import_access = () => {
      throw new Error("offline");
    };
    const a = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(a.result.current.failed).toBe(true));
    expect(a.result.current.loading).toBe(false);

    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: null });
    const b = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(b.result.current.failed).toBe(true));
  });

  it("re-reads on refresh and clears an earlier failure", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.failed).toBe(true));
    mock.current.rpcs.get_patient_import_access = () => ({ ...ACCESS, patient_count: 100, remaining: 1900 });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.access?.patient_count).toBe(100);
    expect(result.current.failed).toBe(false);
  });

  it("keeps the last good answer when a later refresh fails", async () => {
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.access).toEqual(ACCESS));
    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.access).toEqual(ACCESS);
    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("does not let an older answer overwrite a newer one", async () => {
    const slow = deferred();
    let calls = 0;
    mock.current.rpcs.get_patient_import_access = () => (++calls === 1 ? slow.promise : { ...ACCESS, patient_count: 7 });
    const { result } = renderHook(() => usePatientImportAccess(true));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.access?.patient_count).toBe(7);
    await act(async () => {
      slow.resolve({ ...ACCESS, patient_count: 1 });
      await slow.promise;
    });
    expect(result.current.access?.patient_count).toBe(7);
  });

  it("ignores an answer that arrives after it was disabled", async () => {
    const slow = deferred();
    mock.current.rpcs.get_patient_import_access = () => slow.promise;
    const { result, rerender } = renderHook(({ on }) => usePatientImportAccess(on), { initialProps: { on: true } });
    expect(result.current.loading).toBe(true);
    rerender({ on: false });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      slow.resolve(ACCESS);
      await slow.promise;
    });
    expect(result.current.access).toBeNull();
  });

  it("does not update state after unmount", async () => {
    const slow = deferred();
    mock.current.rpcs.get_patient_import_access = () => slow.promise;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => usePatientImportAccess(true));
    unmount();
    await act(async () => {
      slow.resolve(ACCESS);
      await slow.promise;
    });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
