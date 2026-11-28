import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import ManageAppointment from "./ManageAppointment";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const Where = () => {
  const l = useLocation();
  return <span>at={l.pathname + l.search}</span>;
};

describe("ManageAppointment on an old clinic slug", () => {
  beforeEach(() => {
    mock.current = createTableMock();
    const t = mock.current.tables;
    t.profiles = (ops: any[]) =>
      ops.some((o) => o[0] === "eq" && o[1] === "slug" && o[2] === "new-slug")
        ? { data: { id: "d1", full_name: "Asha", slug: "new-slug" } }
        : { data: null };
    t.website_settings = { data: {} };
    t.working_hours = { data: [] };
    mock.current.rpcs.resolve_clinic_slug = (a: any) => (a._slug === "old-slug" ? "new-slug" : null);
  });

  it("redirects to the current slug keeping path and query", async () => {
    render(
      <MemoryRouter initialEntries={["/dr/old-slug/manage?x=1"]}>
        <Routes><Route path="/dr/:slug/manage" element={<><ManageAppointment /><Where /></>} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("at=/dr/new-slug/manage?x=1")).toBeInTheDocument());
  });

  it("stays put when the slug is unknown", async () => {
    render(
      <MemoryRouter initialEntries={["/dr/ghost/manage"]}>
        <Routes><Route path="/dr/:slug/manage" element={<><ManageAppointment /><Where /></>} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("resolve_clinic_slug", { _slug: "ghost" }));
    expect(screen.getByText("at=/dr/ghost/manage")).toBeInTheDocument();
  });
});
