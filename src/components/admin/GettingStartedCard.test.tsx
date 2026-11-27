import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GettingStartedCard from "./GettingStartedCard";

const state = { isStaff: false };
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ isStaff: state.isStaff }) }));
vi.mock("@/hooks/useGettingStarted", () => ({
  useGettingStarted: () => ({
    ready: true,
    completedSteps: 1,
    checklist: [
      { label: "Complete your profile", done: true, href: "/admin/settings" },
      { label: "Add your services", done: false, href: "/admin/my-website" },
    ],
  }),
}));

describe("GettingStartedCard", () => {
  beforeEach(() => { state.isStaff = false; });

  it("shows the checklist to the clinic owner", () => {
    render(<MemoryRouter><GettingStartedCard /></MemoryRouter>);
    expect(screen.getByText("Add your services")).toBeTruthy();
  });

  it("hides it from staff and doctor logins", () => {
    state.isStaff = true;
    render(<MemoryRouter><GettingStartedCard /></MemoryRouter>);
    expect(screen.queryByText("Add your services")).toBeNull();
  });
});
