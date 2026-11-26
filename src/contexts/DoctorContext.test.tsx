import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { DoctorProvider, useDoctorData } from "./DoctorContext";

const m = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  tables: {} as Record<string, any>,
  profileQueries: [] as [string, unknown][][],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, rpc: m.rpc, channel: m.channel, removeChannel: m.removeChannel },
}));

const makeBuilder = (table: string) => {
  const eqs: [string, unknown][] = [];
  if (table === "profiles") m.profileQueries.push(eqs);
  const b: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "eq") return (c: string, v: unknown) => (eqs.push([c, v]), b);
        if (prop === "then") return (res: any, rej: any) => Promise.resolve(resolveFor(table, eqs)).then(res, rej);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(resolveFor(table, eqs));
        return () => b;
      },
    },
  );
  return b;
};
const resolveFor = (table: string, eqs: [string, unknown][]) => {
  const v = m.tables[table];
  if (typeof v === "function") return v(eqs);
  return v ?? { data: null };
};

const Probe = () => {
  const d = useDoctorData();
  const loc = useLocation();
  return (
    <div>
      <span>loading={String(d.loading)}</span>
      <span>name={d.profile?.full_name ?? "none"}</span>
      <span>premium={String(d.isPremium)}</span>
      <span>blog={String(d.hasFeature("blog"))}</span>
      <span>video={String(d.hasFeature("video"))}</span>
      <span>services={d.services.length}</span>
      <span>path={loc.pathname}</span>
      <span>multi={String(d.isMultiDoctor)}</span>
      <span>practitioners={d.practitioners.length}</span>
      <span>bookable={d.bookablePractitioners.length}</span>
      <span data-testid="hours">{JSON.stringify(d.workingHours)}</span>
      <span data-testid="all-hours">{JSON.stringify(d.allWorkingHours)}</span>
      <span data-testid="raw-hours">{JSON.stringify(d.rawWorkingHours)}</span>
      <span>sole={d.soleBookable?.id ?? "none"}</span>
      <span>pracError={String(d.practitionersError)}</span>
      <button onClick={() => d.refreshPractitioners()}>refresh</button>
    </div>
  );
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dr/:slug/*" element={<DoctorProvider><Probe /></DoctorProvider>} />
      </Routes>
    </MemoryRouter>,
  );

describe("DoctorContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profileQueries.length = 0;
    m.tables = {};
    m.from.mockImplementation(makeBuilder);
    m.rpc.mockImplementation(async (fn: string) => {
      if (fn === "doctor_has_premium_access") return { data: true };
      if (fn === "get_public_feature_flags")
        return { data: [{ feature_key: "blog", effective_enabled: true }, { feature_key: "video", effective_enabled: "yes" }] };
      return { data: null };
    });
    const ch: any = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
    m.channel.mockReturnValue(ch);
  });

  it("loads the published doctor by slug (onboarding_completed only) with services, premium and feature flags", async () => {
    m.tables.profiles = { data: { id: "d1", full_name: "Dr One", slug: "dr-one" } };
    m.tables.services = { data: [{ id: 1 }, { id: 2 }] };
    renderAt("/dr/dr-one");
    await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("blog=true")).toBeInTheDocument());
    expect(screen.getByText("name=Dr One")).toBeInTheDocument();
    expect(screen.getByText("premium=true")).toBeInTheDocument();
    expect(screen.getByText("services=2")).toBeInTheDocument();
    expect(m.profileQueries[0]).toEqual([["slug", "dr-one"], ["onboarding_completed", true]]);
  });

  it("flag values must be strictly true; unknown keys are off", async () => {
    m.tables.profiles = { data: { id: "d1", full_name: "Dr One" } };
    renderAt("/dr/dr-one");
    await waitFor(() => expect(screen.getByText("blog=true")).toBeInTheDocument());
    expect(screen.getByText("video=false")).toBeInTheDocument();
  });

  it("premium is false unless the RPC returns exactly true", async () => {
    m.tables.profiles = { data: { id: "d1" } };
    m.rpc.mockImplementation(async (fn: string) => (fn === "doctor_has_premium_access" ? { data: "true" } : { data: [] }));
    renderAt("/dr/x");
    await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
    expect(screen.getByText("premium=false")).toBeInTheDocument();
  });

  it("unknown slug with no history ends loading with no profile and no feature access", async () => {
    renderAt("/dr/ghost");
    await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
    expect(screen.getByText("name=none")).toBeInTheDocument();
    expect(screen.getByText("blog=false")).toBeInTheDocument();
  });

  it("an old slug redirects to the doctor's current slug, preserving the sub-path", async () => {
    m.tables.profiles = (eqs: [string, unknown][]) =>
      eqs.some(([c]) => c === "slug") ? { data: null } : { data: { slug: "new-slug" } };
    m.tables.slug_history = { data: { doctor_id: "d1" } };
    renderAt("/dr/old-slug/blog");
    await waitFor(() => expect(screen.getByText("path=/dr/new-slug/blog")).toBeInTheDocument());
  });

  it("removes both realtime channels on unmount", async () => {
    m.tables.profiles = { data: { id: "d1" } };
    const { unmount } = renderAt("/dr/dr-one");
    await waitFor(() => expect(m.channel.mock.calls.length).toBe(2));
    unmount();
    expect(m.removeChannel).toHaveBeenCalledTimes(2);
  });

  describe("practitioners", () => {
    const pr = (id: string, over: Record<string, unknown> = {}) => ({
      id, display_name: id, slug: id, specialization: null, qualifications: null, experience_years: null, bio: null,
      photo_url: null, registration_number: null, consultation_fee: null, slot_duration_minutes: null,
      online_booking: true, bookable: true, is_primary: id === "p1", sort_order: 0, ...over,
    });
    const row = (pid: string | null, day: number, start: string, end: string, extra: Record<string, unknown> = {}) => ({
      id: `${pid}-${day}`, doctor_id: "d1", practitioner_id: pid, day_of_week: day, is_open: true,
      start_time: start, end_time: end, start_time_2: null, end_time_2: null, ...extra,
    });
    const withRpc = (practitioners: unknown) =>
      m.rpc.mockImplementation(async (fn: string) => {
        if (fn === "get_public_practitioners") return practitioners;
        if (fn === "doctor_has_premium_access") return { data: true };
        return { data: [] };
      });
    const hours = () => JSON.parse(screen.getByTestId("hours").textContent || "[]");
    const allHours = () => JSON.parse(screen.getByTestId("all-hours").textContent || "[]");

    it("asks get_public_practitioners for the clinic", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      withRpc({ data: [pr("p1")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
      expect(m.rpc).toHaveBeenCalledWith("get_public_practitioners", { _doctor_id: "d1" });
    });

    it("two bookable doctors: multi, and the clinic's hours are the union of theirs", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: [row("p1", 1, "09:00:00", "12:00:00"), row("p2", 1, "11:00:00", "14:00:00"), row("gone", 1, "18:00:00", "20:00:00")] };
      withRpc({ data: [pr("p1"), pr("p2")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("multi=true")).toBeInTheDocument());
      expect(screen.getByText("practitioners=2")).toBeInTheDocument();
      expect(screen.getByText("bookable=2")).toBeInTheDocument();
      // Rows of a doctor not in the public list are dropped.
      expect(allHours().map((r: any) => r.practitioner_id)).toEqual(["p1", "p2"]);
      const monday = hours().find((r: any) => r.day_of_week === 1);
      expect(monday).toMatchObject({ is_open: true, start_time: "09:00:00", end_time: "14:00:00", start_time_2: null });
      expect(hours()).toHaveLength(7);
    });

    it("one non-bookable doctor of two keeps the page single-doctor", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      withRpc({ data: [pr("p1"), pr("p2", { bookable: false })] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("practitioners=2")).toBeInTheDocument());
      expect(screen.getByText("bookable=1")).toBeInTheDocument();
      expect(screen.getByText("multi=false")).toBeInTheDocument();
    });

    it("one doctor: workingHours are exactly the rows loaded", async () => {
      const rows = [row("p1", 1, "09:00:00", "13:00:00"), row("p1", 2, "10:00:00", "12:00:00", { start_time_2: "17:00:00", end_time_2: "19:00:00" })];
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: rows };
      withRpc({ data: [pr("p1")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("practitioners=1")).toBeInTheDocument());
      expect(screen.getByText("multi=false")).toBeInTheDocument();
      expect(hours()).toEqual(rows);
    });

    it("a failed lookup leaves no practitioners and keeps every raw row", async () => {
      const rows = [row("p1", 1, "09:00:00", "13:00:00"), row("p2", 2, "10:00:00", "12:00:00")];
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: rows };
      withRpc({ data: null, error: { message: "boom" } });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
      expect(screen.getByText("practitioners=0")).toBeInTheDocument();
      expect(screen.getByText("multi=false")).toBeInTheDocument();
      // Nothing is filtered away: the clinic is still open whenever any of its doctors is.
      expect(allHours()).toEqual(rows);
      expect(hours().filter((r: any) => r.is_open).map((r: any) => [r.day_of_week, r.start_time, r.end_time])).toEqual([
        [1, "09:00:00", "13:00:00"],
        [2, "10:00:00", "12:00:00"],
      ]);
    });

    it("sole bookable doctor in a clinic of two: exposes soleBookable, hours from that doctor only, raw rows for all", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: [row("p1", 1, "09:00:00", "12:00:00"), row("p2", 1, "15:00:00", "18:00:00")] };
      withRpc({ data: [pr("p1", { bookable: false }), pr("p2")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("sole=p2")).toBeInTheDocument());
      expect(screen.getByText("multi=false")).toBeInTheDocument();
      expect(allHours().map((r: any) => r.practitioner_id)).toEqual(["p2"]);
      expect(hours().find((r: any) => r.day_of_week === 1)).toMatchObject({ start_time: "15:00:00", end_time: "18:00:00" });
      expect(JSON.parse(screen.getByTestId("raw-hours").textContent || "[]").map((r: any) => r.practitioner_id)).toEqual(["p1", "p2"]);
    });

    it("a single doctor has no soleBookable and unchanged rows", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: [row("p1", 1, "09:00:00", "12:00:00")] };
      withRpc({ data: [pr("p1")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("practitioners=1")).toBeInTheDocument());
      expect(screen.getByText("sole=none")).toBeInTheDocument();
    });

    it("no bookable doctor at all keeps every listed doctor's rows", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: [row("p1", 1, "09:00:00", "12:00:00"), row("p2", 2, "09:00:00", "12:00:00")] };
      withRpc({ data: [pr("p1", { bookable: false }), pr("p2", { bookable: false })] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("practitioners=2")).toBeInTheDocument());
      expect(allHours()).toHaveLength(2);
    });

    it("retries a failed lookup once, then flags practitionersError and logs", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      m.tables.profiles = { data: { id: "d1" } };
      withRpc({ data: null, error: { message: "boom" } });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("pracError=true")).toBeInTheDocument(), { timeout: 3000 });
      expect(m.rpc.mock.calls.filter((c) => c[0] === "get_public_practitioners")).toHaveLength(2);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it("a lookup that works on the retry clears the error", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      let n = 0;
      m.rpc.mockImplementation(async (fn: string) => {
        if (fn === "get_public_practitioners") return ++n === 1 ? { data: null, error: { message: "x" } } : { data: [pr("p1")] };
        if (fn === "doctor_has_premium_access") return { data: true };
        return { data: [] };
      });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("practitioners=1")).toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByText("pracError=false")).toBeInTheDocument();
    });

    it("refreshPractitioners reloads the doctors and their hours", async () => {
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.working_hours = { data: [row("p1", 1, "09:00:00", "12:00:00"), row("p2", 1, "15:00:00", "18:00:00")] };
      withRpc({ data: [pr("p1"), pr("p2")] });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("multi=true")).toBeInTheDocument());
      withRpc({ data: [pr("p1", { bookable: false }), pr("p2")] });
      fireEvent.click(screen.getByText("refresh"));
      await waitFor(() => expect(screen.getByText("sole=p2")).toBeInTheDocument());
      expect(screen.getByText("multi=false")).toBeInTheDocument();
    });

    it("a rejected lookup does not break the page", async () => {
      const rows = [row("p1", 1, "09:00:00", "13:00:00")];
      m.tables.profiles = { data: { id: "d1" } };
      m.tables.services = { data: [{ id: 1 }] };
      m.tables.working_hours = { data: rows };
      m.rpc.mockImplementation(async (fn: string) => {
        if (fn === "get_public_practitioners") throw new Error("network");
        return { data: [] };
      });
      renderAt("/dr/dr-one");
      await waitFor(() => expect(screen.getByText("loading=false")).toBeInTheDocument());
      expect(screen.getByText("services=1")).toBeInTheDocument();
      expect(screen.getByText("practitioners=0")).toBeInTheDocument();
      expect(hours()).toEqual(rows);
    });
  });
});
