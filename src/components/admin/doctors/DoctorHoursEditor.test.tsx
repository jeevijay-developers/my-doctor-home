import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DoctorHoursEditor from "./DoctorHoursEditor";

const h = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as unknown }, writes: [] as string[] }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (): any => {
    const self: any = { then: (ok: any, bad: any) => Promise.resolve(h.result).then(ok, bad) };
    for (const m of ["select", "eq", "order"]) self[m] = () => self;
    self.update = () => { h.writes.push("update"); return self; };
    self.insert = () => { h.writes.push("insert"); return self; };
    return self;
  };
  return { supabase: { from: () => chain() } };
});

const PR = { id: "pr-1", display_name: "Dr. Bina" } as any;
const renderEditor = () => render(<DoctorHoursEditor open onOpenChange={vi.fn()} practitioner={PR} clinicId="clinic-1" />);

describe("DoctorHoursEditor", () => {
  beforeEach(() => {
    h.result = { data: [], error: null };
    h.writes = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("a failed load shows an error with Retry and keeps Save disabled (no all-closed grid)", async () => {
    h.result = { data: null as any, error: { message: "down" } };
    renderEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByLabelText("Monday open")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save hours/i })).toBeDisabled();

    h.result = { data: [], error: null };
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByLabelText("Monday open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save hours/i })).toBeEnabled();
  });

  it("loads normally when there is no error", async () => {
    renderEditor();
    expect(await screen.findByLabelText("Sunday open")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /save hours/i })).toBeEnabled());
  });
});
