import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@/components/shared/TurnstileWidget", () => ({
  TURNSTILE_SITE_KEY: "test-sitekey",
  getTurnstileSiteKey: () => null,
  default: () => null,
}));

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

document.elementFromPoint = () => null;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
