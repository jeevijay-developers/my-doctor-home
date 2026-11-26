import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import QueueDisplay from "./QueueDisplay";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
};

const renderPage = (url = "/dr/asha/queue") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dr/:slug/queue" element={<QueueDisplay />} />
      </Routes>
    </MemoryRouter>,
  );

const queue = (over: Record<string, unknown> = {}) => ({
  now_serving: 7,
  next_up: [8, 9],
  waiting: 4,
  done: 12,
  avg_minutes: 10,
  updated_at: "2026-10-31T10:00:00Z",
  ...over,
});

describe("QueueDisplay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
    mock.current = createTableMock();
    mock.current.tables.profiles = { data: { id: "d1", full_name: "Asha Rao", clinic_name: "Asha Clinic", specialization: "Cardiologist", city: "Pune" } };
    mock.current.rpcs.get_public_queue = () => queue();
  });
  afterEach(() => vi.useRealTimers());

  it("shows a connecting state first", () => {
    mock.current.rpcs.get_public_queue = () => new Promise(() => {});
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(/Connecting/);
  });

  it("only looks up published clinics by slug", async () => {
    renderPage();
    await flush();
    const q = mock.current.opsOf("profiles")[0];
    expect(mock.current.hasOp(q, "eq", "slug", "asha")).toBe(true);
    expect(mock.current.hasOp(q, "eq", "onboarding_completed", true)).toBe(true);
  });

  it("shows numbers only: now serving, next up, waiting and seen counts, clinic name", async () => {
    renderPage();
    await flush();
    expect(screen.getByText("Dr. Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("Cardiologist")).toBeInTheDocument();
    expect(screen.getByText("Asha Clinic, Pune")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("#8")).toBeInTheDocument();
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.getByLabelText("4 waiting")).toBeInTheDocument();
    expect(screen.getByLabelText("12 seen today")).toBeInTheDocument();
    expect(mock.current.rpc).toHaveBeenCalledWith("get_public_queue", { _doctor_id: "d1" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the patient being served by the masked name the server sends, and nobody else", async () => {
    mock.current.rpcs.get_public_queue = () => queue({ now_serving_name: "Aaryan K." });
    renderPage();
    await flush();
    expect(screen.getByText("Aaryan K.")).toBeInTheDocument();
  });

  it("shows no name when nobody is being served", async () => {
    mock.current.rpcs.get_public_queue = () => queue({ now_serving: null, now_serving_name: "Aaryan K.", next_up: [], waiting: 0 });
    renderPage();
    await flush();
    expect(screen.queryByText("Aaryan K.")).not.toBeInTheDocument();
  });

  it("shows a dash when nobody is being served and 'No one is waiting' when empty", async () => {
    mock.current.rpcs.get_public_queue = () => queue({ now_serving: null, next_up: [], waiting: 0 });
    renderPage();
    await flush();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No one is waiting")).toBeInTheDocument();
  });

  it("unknown clinic shows not found", async () => {
    mock.current.tables.profiles = { data: null };
    renderPage();
    await flush();
    expect(screen.getByText("Clinic not found.")).toBeInTheDocument();
  });

  it("a lookup error is NOT 'not found' (retries instead)", async () => {
    let n = 0;
    mock.current.tables.profiles = () => (++n === 1 ? { data: null, error: { message: "net" } } : { data: { id: "d1", clinic_name: "Asha Clinic" } });
    renderPage();
    await flush();
    expect(screen.queryByText("Clinic not found.")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    await flush();
    expect(screen.getByText("Asha Clinic")).toBeInTheDocument();
  });

  it("works for a doctor with no photo, name or specialty yet", async () => {
    mock.current.tables.profiles = { data: { id: "d1", clinic_name: "Asha Clinic" } };
    renderPage();
    await flush();
    expect(screen.getByText("Asha Clinic")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("warns that numbers may be out of date after 20s without a successful refresh, keeping the last numbers", async () => {
    renderPage();
    await flush();
    mock.current.rpcs.get_public_queue = () => ({ data: null, error: { message: "down" } });
    await act(async () => {
      vi.advanceTimersByTime(25000);
    });
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/Live updates paused/);
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("polls every 5 seconds and shows the new number", async () => {
    renderPage();
    await flush();
    mock.current.rpcs.get_public_queue = () => queue({ now_serving: 8, next_up: [9] });
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    await flush();
    expect(screen.getByText("#8")).toBeInTheDocument();
  });

  describe("multi-doctor clinics", () => {
    const DR_A = { id: "p1", display_name: "Asha Rao", slug: "dr-a", specialization: "Cardiologist", is_primary: true, bookable: true };
    const DR_B = { id: "p2", display_name: "Meera Shah", slug: "dr-b", specialization: "Dermatologist", is_primary: false, bookable: true };
    const queueCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "get_public_queue").map((c: any[]) => c[1]);

    it("a single-doctor clinic asks for its queue exactly as before (no practitioner key)", async () => {
      mock.current.rpcs.get_public_practitioners = () => [DR_A];
      renderPage();
      await flush();
      expect(screen.getByText("#7")).toBeInTheDocument();
      expect(queueCalls().length).toBeGreaterThan(0);
      for (const a of queueCalls()) expect(a).toEqual({ _doctor_id: "d1" });
    });

    it("?doctor=<slug> shows that doctor's queue and name", async () => {
      mock.current.rpcs.get_public_practitioners = () => [DR_A, DR_B];
      mock.current.rpcs.get_public_queue = (args: any) => (args._practitioner_id === "p2" ? queue({ now_serving: 3, next_up: [4] }) : queue());
      renderPage("/dr/asha/queue?doctor=dr-b");
      await flush();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dr. Meera Shah");
      expect(screen.getByText("#3")).toBeInTheDocument();
      expect(queueCalls().length).toBeGreaterThan(0);
      for (const a of queueCalls()) expect(a).toEqual({ _doctor_id: "d1", _practitioner_id: "p2" });
    });

    it("without ?doctor shows one panel per doctor, each polling its own queue", async () => {
      mock.current.rpcs.get_public_practitioners = () => [DR_A, DR_B];
      mock.current.rpcs.get_public_queue = (args: any) =>
        args._practitioner_id === "p2" ? queue({ now_serving: 3, now_serving_name: "Ravi K.", next_up: [4] }) : queue({ now_serving: 7, next_up: [8] });
      renderPage();
      await flush();
      const a = screen.getByRole("region", { name: "Dr. Asha Rao" });
      const b = screen.getByRole("region", { name: "Dr. Meera Shah" });
      expect(within(a).getByText("#7")).toBeInTheDocument();
      expect(within(a).getByText("#8")).toBeInTheDocument();
      expect(within(b).getByText("#3")).toBeInTheDocument();
      expect(within(b).getByText("Ravi K.")).toBeInTheDocument();
      expect(within(b).getByText("#4")).toBeInTheDocument();
      expect(queueCalls()).toEqual(expect.arrayContaining([
        { _doctor_id: "d1", _practitioner_id: "p1" },
        { _doctor_id: "d1", _practitioner_id: "p2" },
      ]));
      const before = queueCalls().length;
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      await flush();
      expect(queueCalls().length).toBe(before + 2);
    });

    it("starts polling the queue at once, without waiting for the doctor list (no practitioner key)", async () => {
      mock.current.rpcs.get_public_practitioners = () => new Promise(() => {});
      renderPage();
      await flush();
      expect(screen.getByText("#7")).toBeInTheDocument();
      expect(queueCalls()[0]).toEqual({ _doctor_id: "d1" });
    });

    it("switches to a panel per doctor when the list arrives later", async () => {
      let release: (v: unknown) => void = () => {};
      mock.current.rpcs.get_public_practitioners = () => new Promise((r) => { release = r; });
      renderPage();
      await flush();
      expect(screen.getByText("#7")).toBeInTheDocument();
      await act(async () => { release({ data: [DR_A, DR_B], error: null }); });
      await flush();
      expect(screen.getByRole("region", { name: "Dr. Asha Rao" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Dr. Meera Shah" })).toBeInTheDocument();
    });

    it("retries a failed doctor list once after a second", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let n = 0;
      mock.current.rpcs.get_public_practitioners = () => (++n === 1 ? { data: null, error: { message: "boom" } } : { data: [DR_A, DR_B], error: null });
      renderPage();
      await flush();
      expect(screen.queryByRole("region", { name: "Dr. Asha Rao" })).not.toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(1100); });
      await flush();
      expect(screen.getByRole("region", { name: "Dr. Asha Rao" })).toBeInTheDocument();
      expect(n).toBe(2);
      err.mockRestore();
    });

    it("logs and keeps the single queue when the list fails twice", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      mock.current.rpcs.get_public_practitioners = () => ({ data: null, error: { message: "boom" } });
      renderPage();
      await flush();
      await act(async () => { vi.advanceTimersByTime(1100); });
      await flush();
      expect(screen.getByText("#7")).toBeInTheDocument();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });
});
