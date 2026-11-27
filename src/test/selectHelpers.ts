import { fireEvent, screen } from "@testing-library/react";

// Radix Select (the app's styled dropdown) needs a few DOM APIs jsdom lacks.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};

/** Opens a Radix Select from its trigger the way a keyboard user would. */
export const openSelect = (trigger: HTMLElement) => {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
};

/** Opens the select and clicks the option with this accessible name. */
export const pickOption = async (trigger: HTMLElement, name: string | RegExp) => {
  openSelect(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
};

/** Opens the select and returns its option labels (leaves it open). */
export const optionLabels = async (trigger: HTMLElement) => {
  openSelect(trigger);
  await screen.findAllByRole("option");
  return screen.getAllByRole("option").map((o) => o.textContent);
};
