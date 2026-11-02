import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SuperAdminRoute from "./SuperAdminRoute";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";

const m = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: m.onAuthStateChange, getSession: m.getSession }, rpc: m.rpc, from: m.from },
}));

const Probe = () => {
  const a = useSuperAdminAccess();
  return <div>inside owner={String(a.isOwner)} pay={String(a.can("payments.view"))}</div>;
};

const tree = () => (
  <MemoryRouter initialEntries={["/superadmin"]}>
    <Routes>
      <Route path="/superadmin" element={<SuperAdminRoute><Probe /></SuperAdminRoute>} />
      <Route path="/auth" element={<div>login page</div>} />
      <Route path="/" element={<div>home page</div>} />
    </Routes>
  </MemoryRouter>
);

const setup = (session: unknown, opts: { isAdmin?: boolean; member?: unknown } = {}) => {
  m.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  m.getSession.mockResolvedValue({ data: { session } });
  m.rpc.mockResolvedValue({ data: opts.isAdmin ?? false });
  m.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.member ?? null }) }) }),
  });
  return render(tree());
};

describe("SuperAdminRoute", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("sends signed-out visitors to login", async () => {
    setup(null);
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });

  it("admits an owner (has_role admin) with every permission", async () => {
    setup({ user: { id: "u1" } }, { isAdmin: true });
    await waitFor(() => expect(screen.getByText(/inside owner=true pay=true/)).toBeInTheDocument());
    expect(m.rpc).toHaveBeenCalledWith("has_role", { _user_id: "u1", _role: "admin" });
  });

  it("admits an active team member limited to their own flags", async () => {
    setup({ user: { id: "u2" } }, { member: { status: "active", permissions: { "payments.view": true } } });
    await waitFor(() => expect(screen.getByText(/inside owner=false pay=true/)).toBeInTheDocument());
  });

  it("does not grant team permissions that were not stored", async () => {
    setup({ user: { id: "u2" } }, { member: { status: "active", permissions: {} } });
    await waitFor(() => expect(screen.getByText(/inside owner=false pay=false/)).toBeInTheDocument());
  });

  it("redirects a suspended team member home", async () => {
    setup({ user: { id: "u3" } }, { member: { status: "suspended", permissions: { "payments.view": true } } });
    await waitFor(() => expect(screen.getByText("home page")).toBeInTheDocument());
    expect(screen.queryByText(/inside/)).not.toBeInTheDocument();
  });

  it("redirects an ordinary signed-in user (not owner, not team) home", async () => {
    setup({ user: { id: "u4" } });
    await waitFor(() => expect(screen.getByText("home page")).toBeInTheDocument());
    expect(screen.queryByText(/inside/)).not.toBeInTheDocument();
  });

  it("fails safe to login if auth never answers within 5s", async () => {
    vi.useFakeTimers();
    m.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    m.getSession.mockReturnValue(new Promise(() => {}));
    render(tree());
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});
