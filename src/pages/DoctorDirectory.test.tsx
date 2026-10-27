import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));

import DoctorDirectory from "./DoctorDirectory";

const doc = (i: number, extra = {}) => ({
  id: `id${i}`, slug: `doc-${i}`, full_name: `Asha ${i}`, specialization: "ENT", qualifications: "MBBS",
  city: "Kota", locality: "Talwandi", clinic_name: null, experience_years: 8, consultation_fee: 500,
  avg_rating: 4.5, review_count: 2, profile_photo_url: null, state: "Rajasthan", total_count: 30, ...extra,
});

const Where = () => <div data-testid="where">{useLocation().pathname + useLocation().search}</div>;
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/doctors" element={<DoctorDirectory />} />
        <Route path="/doctors/:city" element={<DoctorDirectory />} />
        <Route path="/doctors/:city/:specialty" element={<DoctorDirectory />} />
      </Routes>
    </MemoryRouter>,
  );

const robots = () => document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content;

beforeEach(() => {
  rpc.mockReset();
  document.head.innerHTML = "";
});

describe("DoctorDirectory", () => {
  it("lists doctors for a city+specialty hub with profile links and an indexable head", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "search_doctors"
        ? { data: [doc(1), doc(2)], error: null }
        : { data: [{ kind: "specialty", slug: "ent", label: "ENT", doctor_count: 30 }], error: null },
    );
    renderAt("/doctors/kota/ent");

    expect(await screen.findByRole("heading", { level: 1, name: "ENT doctors in Kota" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dr\. Asha 1/ })).toHaveAttribute("href", "/dr/doc-1");
    expect(rpc).toHaveBeenCalledWith("search_doctors", { p_query: null, p_city: "kota", p_specialty: "ent", p_limit: 24, p_offset: 0 });
    await waitFor(() => expect(robots()).toContain("index, follow"));
    expect(document.title).toBe("ENT doctors in Kota - Book Appointment Online | Doctylia");
    expect(screen.getByRole("button", { name: "Show more doctors" })).toBeInTheDocument();
  });

  it("noindexes free-text searches and passes the query through", async () => {
    rpc.mockResolvedValue({ data: [doc(1, { total_count: 1 })], error: null });
    renderAt("/doctors?q=asha");
    expect(await screen.findByText('Results for "asha"')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_doctors", expect.objectContaining({ p_query: "asha" }));
    expect(robots()).toBe("noindex, follow");
  });

  it("submitting the search box navigates with ?q=", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderAt("/doctors/kota");
    const input = await screen.findByLabelText("Search doctors");
    fireEvent.change(input, { target: { value: "dr sharma" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/doctors/kota?q=dr%20sharma"));
  });

  it("shows a friendly message when the RPC is unavailable (migration not applied)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not found" } });
    renderAt("/doctors");
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(robots()).toBe("noindex, follow");
  });

  it("marks a thin city hub noindex", async () => {
    rpc.mockResolvedValue({ data: [doc(1, { total_count: 2 }), doc(2, { total_count: 2 })], error: null });
    renderAt("/doctors/kota");
    await screen.findByRole("heading", { level: 1, name: "Doctors in Kota" });
    await waitFor(() => expect(robots()).toBe("noindex, follow"));
  });
});
