import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlanStatusChip from "./PlanStatusChip";

const state = vi.hoisted(() => ({
  value: { profile: null as any, isStaff: false },
}));

vi.mock("@/hooks/useProfile", () => ({ useProfile: () => state.value }));

// An hour short of n whole days, so "n days left" is stable however long the test takes to run.
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000 - 3_600_000).toISOString();
const renderChip = () => render(<MemoryRouter><PlanStatusChip /></MemoryRouter>);

describe("PlanStatusChip", () => {
  beforeEach(() => { state.value = { profile: null, isStaff: false }; });

  it("shows the plan, the days left and links to the subscription tab", () => {
    state.value.profile = { plan_tier: "premium", plan_status: "active", plan_end: inDays(30) };
    renderChip();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/admin/settings?tab=subscription");
    expect(link).toHaveTextContent(/Premium · 30 days left/);
    expect(link).toHaveAttribute("title", expect.stringMatching(/active until .* \(30 days left\)/));
  });

  it("warns in the last days and after the plan has ended", () => {
    state.value.profile = { plan_tier: "pro", plan_status: "active", plan_end: inDays(2) };
    const { unmount } = renderChip();
    expect(screen.getByRole("link").className).toMatch(/destructive/);
    unmount();

    state.value.profile = { plan_tier: "pro", plan_status: "expired", plan_end: inDays(-3) };
    renderChip();
    expect(screen.getByRole("link")).toHaveTextContent(/Pro plan ended/);
  });

  it("shows trial days left", () => {
    state.value.profile = { plan_tier: "free", plan_status: "trial", trial_end: inDays(4) };
    renderChip();
    expect(screen.getByRole("link")).toHaveTextContent(/Free trial · 4 days left/);
  });

  it("is hidden for staff, who do not see billing, and while the profile loads", () => {
    state.value = { profile: { plan_tier: "premium", plan_status: "active", plan_end: inDays(30) }, isStaff: true };
    const { container, unmount } = renderChip();
    expect(container).toBeEmptyDOMElement();
    unmount();

    state.value = { profile: null, isStaff: false };
    expect(renderChip().container).toBeEmptyDOMElement();
  });

  it("shows the short text on narrow screens and never a day count for a suspended account", () => {
    state.value.profile = { plan_tier: "pro", plan_status: "cancelled", plan_end: inDays(10) };
    renderChip();
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/Account suspended/);
    // the narrow-screen span (sm:hidden) must agree with the wide one
    const narrow = Array.from(link.querySelectorAll("span")).find((el) => el.className.split(" ").includes("sm:hidden"));
    expect(narrow).toBeTruthy();
    expect(narrow).toHaveTextContent("Suspended");
    expect(link).not.toHaveTextContent(/\d+d/);
  });

  it("keeps its visible text in the accessible name and says where it goes", () => {
    state.value.profile = { plan_tier: "premium", plan_status: "active", plan_end: inDays(30) };
    renderChip();
    const link = screen.getByRole("link");
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveTextContent(/Opens subscription settings/);
  });
});
