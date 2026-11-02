import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
