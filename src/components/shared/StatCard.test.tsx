import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndianRupee } from "lucide-react";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("renders the label and pre-formatted value", () => {
    render(<StatCard label="This Month" value="₹12,000" icon={IndianRupee} gradient="from-royal to-teal" />);
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("₹12,000")).toBeInTheDocument();
  });
});
