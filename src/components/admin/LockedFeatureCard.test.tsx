import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LockedFeatureCard from "./LockedFeatureCard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  },
}));

describe("LockedFeatureCard", () => {
  it("renders the feature name and description, and opens the support dialog pre-filled on click", () => {
    render(<LockedFeatureCard featureName="Billing & Invoices" description="Track revenue and generate GST invoices." />);

    expect(screen.getByText("Billing & Invoices")).toBeInTheDocument();
    expect(screen.getByText(/track revenue and generate gst invoices/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /request upgrade/i }));
    expect(screen.getByDisplayValue("Upgrade to Premium")).toBeInTheDocument();
  });
});
