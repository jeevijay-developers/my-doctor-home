import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SocialMarketingCard from "./SocialMarketingCard";
import { emptyScope } from "@/lib/socialMarketing";

const sm = {
  ...emptyScope(),
  status: "active" as const,
  platforms: ["instagram", "facebook"],
  posts_per_month: 12,
  post_types: ["reel", "static"],
  creative_included: true,
  publishing_by: "company" as const,
  reporting_frequency: "monthly" as const,
  approval_process: "each_post" as const,
  monthly_fee: 6000,
  paid_ads: true,
  ad_spend_monthly: 3000,
  agreed: true,
  agreed_on: "2026-11-27",
};

describe("SocialMarketingCard", () => {
  it("shows the agreed scope, fee and who approves", () => {
    render(<SocialMarketingCard sm={sm} />);
    expect(screen.getByText("Instagram, Facebook")).toBeInTheDocument();
    expect(screen.getByText("12 posts per month (Reel / short video, Static post)")).toBeInTheDocument();
    expect(screen.getByText(/₹6000\/month, billed separately/)).toBeInTheDocument();
    expect(screen.getByText("Clinic approves every post before it goes live")).toBeInTheDocument();
    expect(screen.getByText(/Ad spend about ₹3000 per month, paid by you/)).toBeInTheDocument();
  });

  it("renders staff-written text as plain text, never as markup", () => {
    render(<SocialMarketingCard sm={{ ...sm, platforms: ["<img src=x onerror=alert(1)>"] }} />);
    expect(document.querySelector("img")).toBeNull();
  });
});
