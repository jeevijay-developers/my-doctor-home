import { fireEvent, screen } from "@testing-library/react";

/** The date field ("Tue, 24 Nov 2026") that opens the calendar. */
export const dateField = () => screen.getByRole("button", { name: /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}$/ });

/** The time field ("09:00 AM") that opens the hour / minute / AM-PM columns. */
export const timeField = () => screen.getByRole("button", { name: /^\d{2}:\d{2} (AM|PM)$/ });

/** Choose tomorrow in the calendar (always has a full, future day of slots). */
export const pickTomorrow = async () => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  await screen.findByRole("heading", { name: "Select Date" });
  fireEvent.click(await screen.findByRole("button", { name: /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}$/ }));
  const find = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button[name="day"]')].find(
      (b) => b.textContent === String(tomorrow.getDate()) && !b.disabled,
    );
  let day = find();
  if (!day) {
    fireEvent.click(screen.getByRole("button", { name: "Go to next month" }));
    day = find();
  }
  fireEvent.click(day!);
};

/** Tap Continue on the "When" screen (its label names the time that will be booked). */
export const continueWithTime = () => fireEvent.click(screen.getByRole("button", { name: /^Continue · / }));
