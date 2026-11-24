import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import TimePicker from "./TimePicker";

// Free slots only: 10:30 and 17:30 are not in the list because they are already booked.
const SLOTS = ["09:00", "09:30", "10:00", "11:00", "11:30", "17:00", "18:00", "18:30"];

const Harness = ({ slots = SLOTS, start = "09:00", onChange }: { slots?: string[]; start?: string; onChange?: (t: string) => void }) => {
  const [value, setValue] = useState(start);
  return (
    <TimePicker
      slots={slots}
      value={value}
      onChange={(t) => {
        setValue(t);
        onChange?.(t);
      }}
    />
  );
};

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: /\d{2}:\d{2} (AM|PM)|No times/ }));
const group = (name: string) => screen.getByRole("radiogroup", { name });
const options = (name: string) => within(group(name)).getAllByRole("radio").map((r) => r.textContent);

describe("TimePicker", () => {
  it("shows the time as 09:00 AM in the field", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "09:00 AM" })).toBeInTheDocument();
  });

  it("offers only hours that have a free slot, and only the free minutes for the hour", () => {
    render(<Harness />);
    openPicker();
    expect(options("Hour")).toEqual(["09", "10", "11"]);
    expect(options("Minute")).toEqual(["00", "30"]);
    expect(options("AM or PM")).toEqual(["AM", "PM"]);
  });

  it("never offers a booked time: hour 10 only has :00 because 10:30 is taken", () => {
    render(<Harness />);
    openPicker();
    fireEvent.click(within(group("Hour")).getByRole("radio", { name: "10" }));
    expect(options("Minute")).toEqual(["00"]);
    expect(screen.getByRole("radio", { name: "00" })).toHaveAttribute("aria-checked", "true");
  });

  it("changing the hour keeps the popover open; choosing a minute selects the time and closes it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openPicker();
    fireEvent.click(within(group("Hour")).getByRole("radio", { name: "11" }));
    expect(onChange).toHaveBeenLastCalledWith("11:00");
    expect(screen.getByRole("radiogroup", { name: "Minute" })).toBeInTheDocument(); // still open
    fireEvent.click(within(group("Minute")).getByRole("radio", { name: "30" }));
    expect(onChange).toHaveBeenLastCalledWith("11:30");
    expect(screen.queryByRole("radiogroup", { name: "Hour" })).not.toBeInTheDocument(); // closed
    expect(screen.getByRole("button", { name: "11:30 AM" })).toBeInTheDocument();
  });

  it("switching to PM lands on a real afternoon slot and lists the afternoon hours", () => {
    render(<Harness />);
    openPicker();
    fireEvent.click(within(group("AM or PM")).getByRole("radio", { name: "PM" }));
    expect(options("Hour")).toEqual(["05", "06"]);
    expect(screen.getByRole("radio", { name: "PM" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "05" })).toHaveAttribute("aria-checked", "true");
  });

  it("disables AM/PM when that half of the day has nothing free", () => {
    render(<Harness slots={["09:00", "10:00"]} />);
    openPicker();
    expect(within(group("AM or PM")).getByRole("radio", { name: "PM" })).toBeDisabled();
    expect(within(group("AM or PM")).getByRole("radio", { name: "AM" })).toBeEnabled();
  });

  it("moves between hours with the arrow keys", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openPicker();
    const nine = within(group("Hour")).getByRole("radio", { name: "09" });
    nine.focus();
    fireEvent.keyDown(nine, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("10:00");
  });

  it("with no free times, the field says so and cannot be opened", () => {
    render(<TimePicker slots={[]} value="" onChange={() => {}} emptyLabel="No times available" />);
    const field = screen.getByRole("button", { name: "No times available" });
    expect(field).toBeDisabled();
  });

  it("only ever reports a slot from the free list", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openPicker();
    for (const name of ["10", "11", "09"]) fireEvent.click(within(group("Hour")).getByRole("radio", { name }));
    fireEvent.click(within(group("AM or PM")).getByRole("radio", { name: "PM" }));
    for (const call of onChange.mock.calls) expect(SLOTS).toContain(call[0]);
  });
});
