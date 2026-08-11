import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentStatusDonut from "./PaymentStatusDonut";

describe("PaymentStatusDonut", () => {
  it("renders the total and a legend row per bucket", () => {
    render(
      <PaymentStatusDonut
        total={7}
        buckets={[
          { label: "Paid", count: 4, color: "hsl(var(--success))" },
          { label: "Pending", count: 2, color: "hsl(var(--warning))" },
          { label: "Failed", count: 1, color: "hsl(var(--destructive))" },
        ]}
      />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders a zero total with no buckets without crashing", () => {
    render(<PaymentStatusDonut total={0} buckets={[]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
