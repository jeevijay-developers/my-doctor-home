import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DemoBookingForm from "./DemoBookingForm";

const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: db.insert }) },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const dateField = () => screen.getByRole("button", { name: /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}$/ });
const timeField = () => screen.getByRole("button", { name: /^\d{2}:\d{2} (AM|PM)$/ });

const fill = () => {
  fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Dr. Rahul Sharma" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "rahul@example.com" } });
  fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: "9876543210" } });
};

describe("DemoBookingForm", () => {
  beforeEach(() => {
    db.insert.mockReset();
    db.insert.mockResolvedValue({ error: null });
    // A Wednesday morning in India (8:00 AM IST), so the whole 10 AM-7 PM day is open.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T02:30:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("starts with a date and the earliest time chosen, and names it on the button", () => {
    render(<DemoBookingForm />);
    expect(dateField()).toBeInTheDocument();
    expect(timeField()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Book demo · / })).toBeInTheDocument();
  });

  it("offers every minute of an hour, not 30-minute steps", () => {
    render(<DemoBookingForm />);
    fireEvent.click(timeField());
    const minutes = within(screen.getByRole("radiogroup", { name: "Minute" })).getAllByRole("radio");
    expect(minutes).toHaveLength(60); // 10:00 to 10:59, one minute apart
    expect(minutes.map((m) => m.textContent)).toContain("07");
  });

  it("books the chosen time as a demo enquiry and confirms it", async () => {
    render(<DemoBookingForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /^Book demo · / }));
    await waitFor(() => expect(db.insert).toHaveBeenCalledTimes(1));
    const row = db.insert.mock.calls[0][0][0];
    expect(row).toMatchObject({ name: "Dr. Rahul Sharma", email: "rahul@example.com" });
    expect(row.message).toMatch(/^\[Topic: Book a demo\]\n\[Preferred demo time: [A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}, \d{1,2}:\d{2} (AM|PM) IST\]$/);
    expect(await screen.findByText("Your demo is requested")).toBeInTheDocument();
  });

  it("asks for the missing details instead of sending", async () => {
    render(<DemoBookingForm />);
    fireEvent.click(screen.getByRole("button", { name: /^Book demo · / }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
