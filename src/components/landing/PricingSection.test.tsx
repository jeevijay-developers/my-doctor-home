import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PricingSection from "./PricingSection";
import { CUSTOM_PLAN_COPY, CUSTOM_PLAN_FEATURES } from "@/lib/customPlanMarketing";

vi.mock("@/hooks/usePlanPrices", () => ({ usePlanPrices: () => ({ proPrice: 3499, premiumPrice: 4999 }) }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> },
}));

const renderSection = () => render(<MemoryRouter><PricingSection /></MemoryRouter>);

describe("PricingSection", () => {
  it("shows Pro, Premium and the Custom plan card", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Pro Practice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Premium Clinic" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: CUSTOM_PLAN_COPY.name })).toBeInTheDocument();
  });

  it("describes the custom plan truthfully: no fixed price, set with the team, requested from the admin panel", () => {
    renderSection();
    const card = screen.getByRole("heading", { name: CUSTOM_PLAN_COPY.name }).closest("div.relative") as HTMLElement;
    expect(within(card).getByText(CUSTOM_PLAN_COPY.priceLabel)).toBeInTheDocument();
    expect(card).not.toHaveTextContent("₹");
    CUSTOM_PLAN_FEATURES.forEach((f) => expect(within(card).getByText(f)).toBeInTheDocument());
    expect(within(card).getByRole("link", { name: CUSTOM_PLAN_COPY.cta })).toHaveAttribute("href", "/auth?mode=signup");
  });
});
