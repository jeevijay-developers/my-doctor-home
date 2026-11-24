import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DatePicker from "./DatePicker";

// Tue 24 Nov 2026. The clinic is closed on Sundays; the booking window ends Tue 1 Dec.
const today = new Date(2026, 10, 24);
const lastDay = new Date(2026, 11, 1);
const open = (over: Partial<Parameters<typeof DatePicker>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <DatePicker value={today} onChange={onChange} isAvailable={(d) => d.getDay() !== 0} fromDate={today} toDate={lastDay} {...over} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /24 Nov 2026/ }));
  return onChange;
};

const dayButton = (n: number) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[name="day"]')].find((b) => b.textContent === String(n));

describe("DatePicker", () => {
  it("shows the chosen date in the field and a month calendar when opened", () => {
    open();
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(dayButton(25)).toBeTruthy();
  });

  it("greys out the days the clinic is closed", () => {
    open();
    expect(dayButton(29)).toBeDisabled(); // Sunday
    expect(dayButton(26)).toBeEnabled();
  });

  it("does not offer days outside the booking window", () => {
    open();
    expect(dayButton(23)).toBeDisabled(); // before today: shown greyed out, not selectable
    fireEvent.click(screen.getByRole("button", { name: "Go to next month" }));
    expect(dayButton(1)).toBeEnabled(); // last bookable day (Tue 1 Dec)
    expect(dayButton(2)).toBeDisabled(); // beyond the window
  });

  it("selects a day, reports it, and closes the calendar", () => {
    const onChange = open();
    fireEvent.click(dayButton(26)!);
    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 10, 26]);
    expect(screen.queryByText("November 2026")).not.toBeInTheDocument();
  });

  it("does not report a closed day", () => {
    const onChange = open();
    fireEvent.click(dayButton(29)!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("asks for a date when none is chosen yet", () => {
    render(<DatePicker value={null} onChange={() => {}} isAvailable={() => true} fromDate={today} toDate={lastDay} />);
    expect(screen.getByRole("button", { name: "Choose a date" })).toBeInTheDocument();
  });
});
